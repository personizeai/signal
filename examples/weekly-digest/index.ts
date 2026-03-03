/**
 * Weekly Digest — Compile deferred notifications into a digest
 *
 * Shows how to schedule automatic weekly digests that compile
 * all deferred notifications into a single personalized email.
 */
import { Personize } from '@personize/sdk';
import {
    Signal,
    ManualSource,
    SesChannel,
    ConsoleChannel,
} from '@personize/signal';
import type { SignalEvent } from '@personize/signal';

async function main() {
    const client = new Personize({ secretKey: process.env.PERSONIZE_KEY! });
    const manual = new ManualSource();

    const signal = new Signal({
        client,
        channels: [
            new SesChannel({ sourceEmail: 'digest@yourapp.com' }),
            new ConsoleChannel(),
        ],
        sources: [manual],
        engine: {
            memorize: true,
        },
    });

    await signal.start();

    // --- Step 1: Generate some deferred events ---
    // Events with scores 40-60 get deferred automatically

    const email = 'busy-user@acme.com';

    // These low-priority events will likely be deferred
    const events: SignalEvent[] = [
        {
            id: 'evt_1', type: 'feature.released',
            email, data: { feature: 'Dark mode', version: '2.1' },
            timestamp: new Date().toISOString(), metadata: { team: 'product' },
        },
        {
            id: 'evt_2', type: 'content.published',
            email, data: { title: 'Best Practices Guide', url: '/docs/best-practices' },
            timestamp: new Date().toISOString(), metadata: { team: 'marketing' },
        },
        {
            id: 'evt_3', type: 'community.update',
            email, data: { message: '50 new community templates added' },
            timestamp: new Date().toISOString(), metadata: { team: 'community' },
        },
    ];

    for (const event of events) {
        const result = await signal.trigger(event);
        console.log(`[${event.type}] → ${result.action} (score: ${result.score})`);
    }

    // --- Step 2: Run digest manually ---

    console.log('\n--- Running digest ---');
    const digestResult = await signal.digest.buildForUser(email);

    if (digestResult) {
        console.log('Digest sent!');
        console.log('Items compiled:', digestResult.itemsCompiled);
        console.log('SDK calls:', digestResult.sdkCallsUsed);
    } else {
        console.log('No deferred items to compile');
    }

    // --- Step 3: Schedule automatic weekly digests ---

    signal.schedule('weekly-digest', '0 9 * * 1', async () => {
        // In production: query your user table for active users
        const activeUsers = ['busy-user@acme.com', 'another@acme.com'];
        const batch = await signal.digest.runBatch(activeUsers);
        console.log(`Digest batch: ${batch.sent} sent, ${batch.skipped} skipped, ${batch.errors} errors`);
    });

    // Let it run for a bit (in production, signal.start() keeps the process alive)
    await new Promise(resolve => setTimeout(resolve, 2000));
    await signal.stop();
}

main().catch(console.error);

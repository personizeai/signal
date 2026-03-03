/**
 * Quickstart — Minimal Signal setup
 *
 * One source (ManualSource), one channel (ConsoleChannel).
 * Triggers a signup event and prints the AI decision.
 */
import { Personize } from '@personize/sdk';
import { Signal, ConsoleChannel, ManualSource } from '@personize/signal';

async function main() {
    const client = new Personize({ secretKey: process.env.PERSONIZE_KEY! });
    const manual = new ManualSource();

    const signal = new Signal({
        client,
        channels: [new ConsoleChannel()],
        sources: [manual],
    });

    await signal.start();

    // Trigger a signup event — Signal decides whether to notify
    const result = await signal.trigger({
        id: `evt_${Date.now()}`,
        type: 'user.signup',
        email: 'jane@acme.com',
        data: { plan: 'pro', source: 'website' },
        timestamp: new Date().toISOString(),
    });

    console.log('Decision:', result.action);  // SEND | DEFER | SKIP
    console.log('Score:', result.score);       // 0-100
    console.log('Reasoning:', result.reasoning);
    console.log('Duration:', result.durationMs, 'ms');
    console.log('SDK calls:', result.sdkCallsUsed);

    await signal.stop();
}

main().catch(console.error);

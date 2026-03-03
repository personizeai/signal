/**
 * Multi-Team — Product + Sales + Marketing on same records
 *
 * Shows how multiple teams contribute events and workspace items
 * to the same entity records. Signal's AI sees the full cross-team
 * picture when making notification decisions.
 */
import { Personize } from '@personize/sdk';
import {
    Signal,
    ManualSource,
    SlackChannel,
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
            new ConsoleChannel(),
            new SesChannel({ sourceEmail: 'notifications@yourapp.com' }),
            new SlackChannel({ webhookUrl: process.env.SLACK_WEBHOOK! }),
        ],
        sources: [manual],
        engine: {
            workspaceUpdates: true,
            dailyCap: 5,
        },
    });

    await signal.start();

    const email = 'vp-engineering@bigcorp.com';

    // --- Product team contributes context ---

    await signal.workspace.addUpdate(email,
        '[Product] Activated enterprise SSO integration');

    await signal.workspace.addNote(email, {
        content: 'Power user — 200+ API calls/day, using advanced memory features',
        tags: ['product', 'power-user'],
    });

    // Product event: usage milestone
    const productResult = await signal.trigger(teamEvent(
        email, 'usage.milestone', 'product',
        { milestone: '1000_api_calls', daysActive: 14 },
    ));
    console.log(`[Product] usage.milestone → ${productResult.action} (${productResult.score})`);

    // --- Sales team contributes context ---

    await signal.workspace.addTask(email, {
        title: 'Prepare renewal proposal — contract expires in 45 days',
        priority: 'high',
        assignee: 'sarah@yourteam.com',
    });

    await signal.workspace.addNote(email, {
        content: 'Budget approved for expansion. Decision maker is CTO.',
        tags: ['sales', 'expansion'],
    });

    // Sales event: deal stage changed
    const salesResult = await signal.trigger(teamEvent(
        email, 'deal.stage_changed', 'sales',
        { stage: 'negotiation', previousStage: 'proposal', rep: 'sarah' },
    ));
    console.log(`[Sales] deal.stage_changed → ${salesResult.action} (${salesResult.score})`);

    // --- Marketing team contributes context ---

    await signal.workspace.addUpdate(email,
        '[Marketing] Opened 3 of last 5 emails. Clicked case study link.');

    // Marketing event: content engagement
    const marketingResult = await signal.trigger(teamEvent(
        email, 'content.engaged', 'marketing',
        { content: 'Enterprise Case Study', action: 'downloaded', campaign: 'Q1-enterprise' },
    ));
    console.log(`[Marketing] content.engaged → ${marketingResult.action} (${marketingResult.score})`);

    // --- View the combined workspace ---

    console.log('\n--- Combined Workspace Digest ---');
    const digest = await signal.workspace.getDigest(email);
    console.log(digest);

    await signal.stop();
}

function teamEvent(
    email: string,
    type: string,
    team: string,
    data: Record<string, unknown>,
): SignalEvent {
    return {
        id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        type,
        email,
        data,
        timestamp: new Date().toISOString(),
        metadata: { team },
    };
}

main().catch(console.error);

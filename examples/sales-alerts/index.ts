/**
 * Sales Alerts — Usage drop triggers alert to sales team
 *
 * Monitors product usage and alerts the sales team via Slack
 * when a high-value customer's engagement drops. Signal's AI
 * decides whether the alert is warranted based on full context.
 */
import { Personize } from '@personize/sdk';
import {
    Signal,
    ManualSource,
    SlackChannel,
    ConsoleChannel,
} from '@personize/signal';
import type { SignalEvent } from '@personize/signal';

async function main() {
    const client = new Personize({ secretKey: process.env.PERSONIZE_KEY! });
    const manual = new ManualSource();

    const signal = new Signal({
        client,
        channels: [
            new SlackChannel({ webhookUrl: process.env.SLACK_SALES_WEBHOOK! }),
            new ConsoleChannel(), // fallback for dev
        ],
        sources: [manual],
        engine: {
            dailyCap: 10,            // Sales team can handle more alerts
            workspaceUpdates: true,  // Create follow-up tasks
        },
    });

    await signal.start();

    // Add context to the workspace first
    await signal.workspace.addNote('enterprise-lead@bigcorp.com', {
        content: 'Annual contract renewal in 30 days. Key stakeholder: VP Engineering.',
        tags: ['sales', 'renewal'],
    });

    // Trigger usage drop alert
    const result = await signal.trigger({
        id: `evt_${Date.now()}`,
        type: 'usage.drop',
        email: 'enterprise-lead@bigcorp.com',
        data: {
            metric: 'api_calls',
            previousValue: 500,
            currentValue: 50,
            dropPercent: 90,
            accountTier: 'enterprise',
            contractValue: 120000,
        },
        timestamp: new Date().toISOString(),
        metadata: { team: 'product' },
    });

    console.log('\n--- Sales Alert Result ---');
    console.log('Action:', result.action);
    console.log('Score:', result.score);
    console.log('Reasoning:', result.reasoning);

    if (result.action === 'SEND') {
        console.log('Channel:', result.channel);
        console.log('Subject:', result.content?.subject);
    }

    if (result.action === 'DEFER') {
        console.log('Deferred to digest — not urgent enough for immediate alert');
    }

    await signal.stop();
}

main().catch(console.error);

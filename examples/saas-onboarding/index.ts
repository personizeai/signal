/**
 * SaaS Onboarding — Signup → Nurture → Convert sequence
 *
 * Shows how product events flow through Signal to deliver
 * contextual, governance-aware notifications during onboarding.
 */
import { Personize } from '@personize/sdk';
import {
    Signal,
    ManualSource,
    SesChannel,
    InAppChannel,
} from '@personize/signal';
import type { SignalEvent, Recipient, DeliveryPayload } from '@personize/signal';

async function main() {
    const client = new Personize({ secretKey: process.env.PERSONIZE_KEY! });
    const manual = new ManualSource();

    // In-app channel bridges to your notification UI
    const inApp = new InAppChannel(async (recipient: Recipient, payload: DeliveryPayload) => {
        console.log(`[IN-APP] → ${recipient.email}: ${payload.subject}`);
        // In production: write to your notifications table / push via WebSocket
        return { success: true, channel: 'in-app', timestamp: new Date().toISOString() };
    });

    const signal = new Signal({
        client,
        channels: [
            new SesChannel({ sourceEmail: 'onboarding@yourapp.com', region: 'us-east-1' }),
            inApp,
        ],
        sources: [manual],
        engine: {
            dailyCap: 3,             // Don't overwhelm new users
            workspaceUpdates: true,  // Track onboarding in workspace
            memorize: true,          // AI remembers what was sent
        },
    });

    await signal.start();

    // --- Simulate onboarding events ---

    const email = 'new-user@acme.com';

    // Day 1: User signs up
    await signal.trigger(event(email, 'user.signup', { plan: 'trial', source: 'website' }));

    // Day 1: User connects first integration
    await signal.trigger(event(email, 'integration.connected', { provider: 'hubspot' }));

    // Day 2: User runs first agent
    await signal.trigger(event(email, 'prompt.executed', { agentId: 'enrichment', tokensUsed: 1200 }));

    // Day 3: User hits first milestone
    await signal.trigger(event(email, 'usage.milestone', { milestone: '10_records_memorized' }));

    // Day 7: Usage drops
    await signal.trigger(event(email, 'usage.drop', {
        metric: 'daily_logins',
        previousValue: 5,
        currentValue: 1,
        dropPercent: 80,
    }));

    await signal.stop();
}

function event(email: string, type: string, data: Record<string, unknown>): SignalEvent {
    return {
        id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        type,
        email,
        data,
        timestamp: new Date().toISOString(),
        metadata: { team: 'product' },
    };
}

main().catch(console.error);

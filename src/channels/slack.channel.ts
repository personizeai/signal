import type { Channel, Recipient, DeliveryPayload, DeliveryResult } from '../types';

export interface SlackChannelConfig {
    /** Slack incoming webhook URL */
    webhookUrl: string;
}

/**
 * SlackChannel: delivers notifications via Slack incoming webhook.
 *
 * Uses fetch — no additional dependencies required.
 * Never throws on delivery failure — returns { success: false, error }.
 */
export class SlackChannel implements Channel {
    name = 'slack';
    private config: SlackChannelConfig;

    constructor(config: SlackChannelConfig) {
        this.config = config;
    }

    async send(recipient: Recipient, payload: DeliveryPayload): Promise<DeliveryResult> {
        const timestamp = new Date().toISOString();

        try {
            const blocks: any[] = [];

            // Header with subject
            if (payload.subject) {
                blocks.push({
                    type: 'header',
                    text: { type: 'plain_text', text: payload.subject },
                });
            }

            // Body section
            blocks.push({
                type: 'section',
                text: { type: 'mrkdwn', text: payload.body },
            });

            // Context with recipient info
            blocks.push({
                type: 'context',
                elements: [{
                    type: 'mrkdwn',
                    text: `For: ${recipient.name || recipient.email} | Priority: ${payload.priority}`,
                }],
            });

            const response = await fetch(this.config.webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ blocks }),
            });

            if (!response.ok) {
                const errorBody = await response.text();
                return {
                    success: false,
                    channel: this.name,
                    error: `Slack ${response.status}: ${errorBody}`,
                    timestamp,
                };
            }

            return {
                success: true,
                channel: this.name,
                timestamp,
            };
        } catch (err) {
            console.error(`[SlackChannel] Failed to send:`, err instanceof Error ? err.message : err);
            return {
                success: false,
                channel: this.name,
                error: err instanceof Error ? err.message : String(err),
                timestamp,
            };
        }
    }
}

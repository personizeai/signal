import type { Channel, Recipient, DeliveryPayload, DeliveryResult } from '../types';

export interface SendGridChannelConfig {
    /** SendGrid API key */
    apiKey: string;
    /** Sender email address */
    fromEmail: string;
    /** Sender name (optional) */
    fromName?: string;
}

/**
 * SendGridChannel: delivers notifications via SendGrid v3 REST API.
 *
 * Uses fetch — no additional dependencies required.
 * Never throws on delivery failure — returns { success: false, error }.
 */
export class SendGridChannel implements Channel {
    name = 'sendgrid';
    private config: SendGridChannelConfig;

    constructor(config: SendGridChannelConfig) {
        this.config = config;
    }

    async send(recipient: Recipient, payload: DeliveryPayload): Promise<DeliveryResult> {
        const timestamp = new Date().toISOString();

        try {
            const body: any = {
                personalizations: [{
                    to: [{ email: recipient.email, name: recipient.name }],
                }],
                from: {
                    email: this.config.fromEmail,
                    name: this.config.fromName,
                },
                subject: payload.subject || 'Notification',
                content: [],
            };

            if (payload.htmlBody) {
                body.content.push({ type: 'text/html', value: payload.htmlBody });
            } else {
                body.content.push({ type: 'text/plain', value: payload.body });
            }

            const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                const errorBody = await response.text();
                return {
                    success: false,
                    channel: this.name,
                    error: `SendGrid ${response.status}: ${errorBody}`,
                    timestamp,
                };
            }

            // SendGrid returns 202 with x-message-id header
            const messageId = response.headers.get('x-message-id') || undefined;

            return {
                success: true,
                channel: this.name,
                messageId,
                timestamp,
            };
        } catch (err) {
            console.error(`[SendGridChannel] Failed to send to ${recipient.email}:`, err instanceof Error ? err.message : err);
            return {
                success: false,
                channel: this.name,
                error: err instanceof Error ? err.message : String(err),
                timestamp,
            };
        }
    }
}

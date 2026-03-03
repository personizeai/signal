import type { Channel, Recipient, DeliveryPayload, DeliveryResult } from '../types';
import { DeliveryError } from '../errors';

export interface SesChannelConfig {
    /** AWS region (default: 'us-east-1') */
    region?: string;
    /** Sender email address */
    sourceEmail: string;
    /** AWS credentials (optional — uses env/IAM role by default) */
    credentials?: {
        accessKeyId: string;
        secretAccessKey: string;
    };
}

/**
 * SesChannel: delivers notifications via AWS SES.
 *
 * Requires `@aws-sdk/client-ses` as a peer dependency in the consuming project.
 * Never throws on delivery failure — returns { success: false, error }.
 */
export class SesChannel implements Channel {
    name = 'ses';
    private config: SesChannelConfig;

    constructor(config: SesChannelConfig) {
        this.config = config;
    }

    async send(recipient: Recipient, payload: DeliveryPayload): Promise<DeliveryResult> {
        const timestamp = new Date().toISOString();

        try {
            // Dynamic import to avoid requiring @aws-sdk/client-ses at install time
            const { SESClient, SendEmailCommand } = await import('@aws-sdk/client-ses');

            const clientConfig: any = { region: this.config.region || 'us-east-1' };
            if (this.config.credentials) {
                clientConfig.credentials = this.config.credentials;
            }

            const sesClient = new SESClient(clientConfig);

            const command = new SendEmailCommand({
                Source: this.config.sourceEmail,
                Destination: {
                    ToAddresses: [recipient.email],
                },
                Message: {
                    Subject: { Data: payload.subject || 'Notification' },
                    Body: {
                        ...(payload.htmlBody
                            ? { Html: { Data: payload.htmlBody } }
                            : { Text: { Data: payload.body } }),
                    },
                },
            });

            const result = await sesClient.send(command);

            return {
                success: true,
                channel: this.name,
                messageId: result.MessageId,
                timestamp,
            };
        } catch (err) {
            console.error(`[SesChannel] Failed to send to ${recipient.email}:`, err instanceof Error ? err.message : err);
            return {
                success: false,
                channel: this.name,
                error: err instanceof Error ? err.message : String(err),
                timestamp,
            };
        }
    }
}

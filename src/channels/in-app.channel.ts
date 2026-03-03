import type { Channel, Recipient, DeliveryPayload, DeliveryResult } from '../types';

/**
 * InAppChannel: callback-based channel for in-app notification systems.
 *
 * The consumer provides a handler function that bridges Signal to their
 * existing notification infrastructure. This is how the Personize platform
 * connects Signal to its existing NotificationService.
 *
 * Usage:
 *   const inApp = new InAppChannel(async (recipient, payload) => {
 *       await MyNotificationService.create(recipient.userId, {
 *           title: payload.subject,
 *           body: payload.body,
 *       });
 *       return { success: true, channel: 'in-app', timestamp: new Date().toISOString() };
 *   });
 */
export class InAppChannel implements Channel {
    name = 'in-app';

    constructor(
        private handler: (recipient: Recipient, payload: DeliveryPayload) => Promise<DeliveryResult>,
    ) {}

    async send(recipient: Recipient, payload: DeliveryPayload): Promise<DeliveryResult> {
        try {
            return await this.handler(recipient, payload);
        } catch (err) {
            console.error(`[InAppChannel] Handler failed for ${recipient.email}:`, err instanceof Error ? err.message : err);
            return {
                success: false,
                channel: this.name,
                error: err instanceof Error ? err.message : String(err),
                timestamp: new Date().toISOString(),
            };
        }
    }
}

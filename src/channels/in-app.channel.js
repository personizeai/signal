"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InAppChannel = void 0;
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
class InAppChannel {
    constructor(handler) {
        this.handler = handler;
        this.name = 'in-app';
    }
    async send(recipient, payload) {
        try {
            return await this.handler(recipient, payload);
        }
        catch (err) {
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
exports.InAppChannel = InAppChannel;

import type { Channel, Recipient, DeliveryPayload, DeliveryResult } from '../types';

/**
 * ConsoleChannel: logs notifications to stdout.
 *
 * Use this for development and testing — no external service required.
 */
export class ConsoleChannel implements Channel {
    name = 'console';

    async send(recipient: Recipient, payload: DeliveryPayload): Promise<DeliveryResult> {
        const timestamp = new Date().toISOString();
        console.log('\n' + '='.repeat(60));
        console.log(`[Signal:Console] Notification for ${recipient.email}`);
        console.log('-'.repeat(60));
        if (payload.subject) console.log(`Subject:  ${payload.subject}`);
        console.log(`Priority: ${payload.priority}`);
        console.log(`Body:     ${payload.body}`);
        console.log('='.repeat(60) + '\n');

        return {
            success: true,
            channel: this.name,
            timestamp,
        };
    }
}

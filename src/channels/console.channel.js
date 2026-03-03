"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConsoleChannel = void 0;
/**
 * ConsoleChannel: logs notifications to stdout.
 *
 * Use this for development and testing — no external service required.
 */
class ConsoleChannel {
    constructor() {
        this.name = 'console';
    }
    async send(recipient, payload) {
        const timestamp = new Date().toISOString();
        console.log('\n' + '='.repeat(60));
        console.log(`[Signal:Console] Notification for ${recipient.email}`);
        console.log('-'.repeat(60));
        if (payload.subject)
            console.log(`Subject:  ${payload.subject}`);
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
exports.ConsoleChannel = ConsoleChannel;

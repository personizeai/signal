"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ManualSource = void 0;
/**
 * ManualSource: allows programmatic event emission.
 *
 * Use this when you want to push events directly from your application code
 * rather than receiving them from an external system.
 *
 * Usage:
 *   const source = new ManualSource();
 *   const signal = new Signal({ client, channels, sources: [source] });
 *   await signal.start();
 *
 *   // Later, when something happens in your app:
 *   source.emit({ id: ulid(), type: 'user.signup', email: 'jane@acme.com', ... });
 */
class ManualSource {
    constructor() {
        this.name = 'manual';
    }
    async start(emitter) {
        this.emitter = emitter;
    }
    async stop() {
        this.emitter = undefined;
    }
    /** Push an event into the Signal engine for evaluation */
    emit(event) {
        if (!this.emitter) {
            console.warn('[ManualSource] Source not started — event discarded:', event.id);
            return;
        }
        this.emitter.emit('event', event);
    }
}
exports.ManualSource = ManualSource;

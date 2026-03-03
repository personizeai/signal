import { EventEmitter } from 'events';
import type { Source, SignalEvent } from '../types';

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
export class ManualSource implements Source {
    name = 'manual';
    private emitter?: EventEmitter;

    async start(emitter: EventEmitter): Promise<void> {
        this.emitter = emitter;
    }

    async stop(): Promise<void> {
        this.emitter = undefined;
    }

    /** Push an event into the Signal engine for evaluation */
    emit(event: SignalEvent): void {
        if (!this.emitter) {
            console.warn('[ManualSource] Source not started — event discarded:', event.id);
            return;
        }
        this.emitter.emit('event', event);
    }
}

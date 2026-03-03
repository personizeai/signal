# How to Build a Signal Source

A source produces events from external systems. Here's how to build one.

## 1. Implement the Source interface

Create a new file in `src/sources/`:

```typescript
import { EventEmitter } from 'events';
import type { Source, SignalEvent } from '../types';

export interface MySourceConfig {
    // Your configuration options
    apiKey: string;
    pollIntervalMs?: number;
}

export class MySource implements Source {
    name = 'my-source';
    private emitter?: EventEmitter;
    private config: MySourceConfig;
    private pollTimer?: ReturnType<typeof setInterval>;

    constructor(config: MySourceConfig) {
        this.config = config;
    }

    async start(emitter: EventEmitter): Promise<void> {
        this.emitter = emitter;

        // Set up your event listener (webhook, polling, subscription, etc.)
        // Example: poll an external API every N seconds
        this.pollTimer = setInterval(() => this.poll(), this.config.pollIntervalMs || 60000);
    }

    async stop(): Promise<void> {
        if (this.pollTimer) clearInterval(this.pollTimer);
        this.emitter = undefined;
    }

    private async poll(): Promise<void> {
        try {
            // Fetch events from your external system
            // For each event, emit it:
            const event: SignalEvent = {
                id: `my-source-${Date.now()}`,
                type: 'my-source.event-detected',
                email: 'user@example.com',
                data: { /* structured event data */ },
                timestamp: new Date().toISOString(),
                metadata: { source: 'my-source' },
            };

            this.emitter?.emit('event', event);
        } catch (err) {
            console.error(`[${this.name}] Poll error:`, err);
        }
    }
}
```

## 2. Export it

Add to `src/sources/index.ts`:
```typescript
export { MySource } from './my-source';
```

Add to `src/index.ts`:
```typescript
export { MySource } from './sources/my-source';
export type { MySourceConfig } from './sources/my-source';
```

## 3. Write a test

Create `src/__tests__/sources/my-source.test.ts`:
```typescript
import { EventEmitter } from 'events';
import { MySource } from '../../sources/my-source';

describe('MySource', () => {
    it('starts and stops without error', async () => {
        const source = new MySource({ apiKey: 'test' });
        const emitter = new EventEmitter();
        await source.start(emitter);
        await source.stop();
    });
});
```

## 4. Submit a PR

That's it. One interface, one file, one test.

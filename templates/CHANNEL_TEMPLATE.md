# How to Build a Signal Channel

A channel delivers messages to recipients. Here's how to build one.

## 1. Implement the Channel interface

Create a new file in `src/channels/`:

```typescript
import type { Channel, Recipient, DeliveryPayload, DeliveryResult } from '../types';

export interface MyChannelConfig {
    // Your configuration options
    apiKey: string;
}

export class MyChannel implements Channel {
    name = 'my-channel';
    private config: MyChannelConfig;

    constructor(config: MyChannelConfig) {
        this.config = config;
    }

    async send(recipient: Recipient, payload: DeliveryPayload): Promise<DeliveryResult> {
        const timestamp = new Date().toISOString();
        try {
            // Your delivery logic here
            // recipient.email — always available
            // recipient.name — optional
            // payload.subject — optional (for email-like channels)
            // payload.body — always available (plain text)
            // payload.htmlBody — optional (HTML version)
            // payload.priority — 'immediate' | 'standard' | 'digest'

            return {
                success: true,
                channel: this.name,
                messageId: '...', // optional
                timestamp,
            };
        } catch (err) {
            // Never throw — return failure result
            return {
                success: false,
                channel: this.name,
                error: err instanceof Error ? err.message : String(err),
                timestamp,
            };
        }
    }
}
```

## 2. Export it

Add to `src/channels/index.ts`:
```typescript
export { MyChannel } from './my-channel';
```

Add to `src/index.ts`:
```typescript
export { MyChannel } from './channels/my-channel';
export type { MyChannelConfig } from './channels/my-channel';
```

## 3. Write a test

Create `src/__tests__/channels/my-channel.test.ts`:
```typescript
import { MyChannel } from '../../channels/my-channel';

describe('MyChannel', () => {
    it('sends a notification', async () => {
        const channel = new MyChannel({ apiKey: 'test' });
        const result = await channel.send(
            { email: 'test@example.com' },
            { body: 'Hello', priority: 'standard' },
        );
        expect(result.success).toBe(true);
        expect(result.channel).toBe('my-channel');
    });
});
```

## 4. Submit a PR

That's it. One interface, one file, one test.

# @personize/signal

Smart notification engine built on the [Personize SDK](https://www.npmjs.com/package/@personize/sdk). Decides **IF**, **WHAT**, **WHEN**, and **HOW** to notify each person using unified memory and governance guardrails.

Delivery channels and event sources are modular — the community adds these. The core intelligence is Personize.

## Quick Start

```bash
npm install @personize/signal @personize/sdk
```

```typescript
import { Personize } from '@personize/sdk';
import { Signal, ConsoleChannel, ManualSource } from '@personize/signal';

const client = new Personize({ secretKey: process.env.PERSONIZE_KEY! });
const manual = new ManualSource();

const signal = new Signal({
    client,
    channels: [new ConsoleChannel()],
    sources: [manual],
});

await signal.start();

// Push an event — Signal decides whether to notify
manual.emit({
    id: 'evt_001',
    type: 'user.signup',
    email: 'jane@acme.com',
    data: { plan: 'pro', source: 'website' },
    timestamp: new Date().toISOString(),
});
```

Or trigger synchronously and get the AI decision:

```typescript
const result = await signal.trigger({
    id: 'evt_002',
    type: 'usage.drop',
    email: 'jane@acme.com',
    data: { metric: 'daily_logins', dropPercent: 40 },
    timestamp: new Date().toISOString(),
});

console.log(result.action);    // 'SEND' | 'DEFER' | 'SKIP'
console.log(result.score);     // 0-100
console.log(result.reasoning); // AI explanation
```

## How It Works

```
Event In           Pre-Check          Context Assembly         AI Decision
  |                   |                     |                      |
Source ──> [ dedup + daily cap ] ──> [ 4 parallel SDK calls ] ──> [ prompt() ]
  |        (no SDK calls)           |  smartContext (rules)    |    |
  |        Fast skip if:            |  smartDigest (entity)    |   SEND ──> channel.send()
  |        - Same event < 6h ago    |  smartRecall (context)   |   DEFER ──> memorize + digest
  |        - Over daily cap (5/day) |  smartRecall (sent log)  |   SKIP ──> log, done
  |                                                                |
  └────────────────────────── EngineResult ───────────────────────-┘
```

### Engine Flow (9 Steps)

1. **Receive** — `SignalEvent` enters via Source or `signal.trigger()`
2. **Pre-check** — dedup + daily cap (no SDK calls, instant)
3. **Context assembly** — 4 parallel SDK calls: governance rules, entity digest, semantic context, recent notifications sent
4. **AI decision** — `prompt()` scores 0-100: SEND (>60), DEFER (40-60), SKIP (<40)
5. **Decision routing** — branch on SEND/DEFER/SKIP
6. **Deliver** — `channel.send()` (if SEND)
7. **Workspace update** — optional task/update creation on the entity record
8. **Feedback** — memorize what was sent back to the entity record
9. **Return** — `EngineResult` with action, score, reasoning, delivery status, duration

## Built-in Channels

| Channel | Use Case | Config |
|---------|----------|--------|
| `ConsoleChannel` | Development & testing | None |
| `SesChannel` | AWS SES email | `{ sourceEmail, region? }` |
| `SendGridChannel` | SendGrid email | `{ apiKey, fromEmail, fromName? }` |
| `SlackChannel` | Slack webhooks | `{ webhookUrl }` |
| `InAppChannel` | Callback-based (bridge to your UI) | `handler: (recipient, payload) => ...` |

## Built-in Sources

| Source | Use Case | Config |
|--------|----------|--------|
| `ManualSource` | Programmatic events from your code | None — call `.emit(event)` |
| `WebhookSource` | HTTP webhooks into Signal | `{ path?, secret?, parser? }` |

## Workspace Utilities

Signal includes convenience methods for the Personize workspace pattern — collaborative workstations per entity record:

```typescript
// Add tasks, notes, updates, issues to any entity record
await signal.workspace.addTask('jane@acme.com', {
    title: 'Follow up on trial expiry',
    priority: 'high',
    assignee: 'sales',
});

await signal.workspace.addNote('jane@acme.com', {
    content: 'Showed strong interest in enterprise features during demo',
    tags: ['sales', 'enterprise'],
});

await signal.workspace.addUpdate('jane@acme.com',
    'Onboarding completed — activated 3 integrations');

// Read back workspace data
const tasks = await signal.workspace.getTasks('jane@acme.com');
const digest = await signal.workspace.getDigest('jane@acme.com');
```

When `engine.workspaceUpdates` is enabled, the engine automatically:
- On **SEND** — creates an update: "Notification sent: \<subject\>"
- On **DEFER** — creates a task: "Review deferred notification for \<entity\>"

## Digest Pipeline

Deferred notifications (score 40-60) are stored in Personize memory with `signal:deferred` tags. The digest builder compiles them into periodic personalized summaries:

```typescript
// Run digest for one user
const result = await signal.digest.buildForUser('jane@acme.com');

// Run batch digest for all users (use with scheduler)
const batch = await signal.digest.runBatch([
    'jane@acme.com',
    'john@acme.com',
]);

// Schedule automatic daily digests
signal.schedule('daily-digest', '0 9 * * 1-5', async () => {
    const users = await getActiveUsers(); // your function
    await signal.digest.runBatch(users);
});
```

## Multi-Team Patterns

Multiple teams contribute to the same entity records. Each team tags their events:

```typescript
// Product team
manual.emit({
    type: 'usage.milestone',
    email: 'jane@acme.com',
    data: { milestone: '100_api_calls' },
    metadata: { team: 'product' },
    // ...
});

// Sales team
manual.emit({
    type: 'deal.stage_changed',
    email: 'jane@acme.com',
    data: { stage: 'proposal', rep: 'mike' },
    metadata: { team: 'sales' },
    // ...
});
```

When Signal evaluates any event, `smartDigest` returns the combined context from ALL teams. The AI decides based on the full cross-team picture — product usage + sales activity + marketing engagement.

## Cost Controls

Signal is designed to be cost-efficient with the Personize API:

```typescript
const signal = new Signal({
    client,
    channels: [...],
    engine: {
        dailyCap: 5,                        // max notifications per email per day
        deduplicationWindowMs: 6 * 60 * 60 * 1000, // skip same event type within 6h
        maxEvaluationsPerMinute: 20,         // rate limit for batch processing
        concurrency: 5,                      // max parallel evaluations
        memorize: true,                      // feedback loop (default)
        workspaceUpdates: false,             // workspace tasks/updates (default: off)
    },
});
```

**Pre-check** skips events before any SDK calls:
- Same event type for same email within dedup window → instant SKIP
- Email over daily cap → instant SKIP

**Per evaluation**: typically 4-5 SDK calls (smartContext + smartDigest + 2x smartRecall + prompt). Pre-check reduces this to 0 for obvious skips.

## Adding a Channel

See [templates/CHANNEL_TEMPLATE.md](templates/CHANNEL_TEMPLATE.md). One interface, one file, one test.

```typescript
import type { Channel, Recipient, DeliveryPayload, DeliveryResult } from '@personize/signal';

export class TwilioChannel implements Channel {
    name = 'twilio';

    async send(recipient: Recipient, payload: DeliveryPayload): Promise<DeliveryResult> {
        // Your delivery logic
        return { success: true, channel: this.name, timestamp: new Date().toISOString() };
    }
}
```

## Adding a Source

See [templates/SOURCE_TEMPLATE.md](templates/SOURCE_TEMPLATE.md). One interface, one file, one test.

```typescript
import { EventEmitter } from 'events';
import type { Source, SignalEvent } from '@personize/signal';

export class StripeSource implements Source {
    name = 'stripe';

    async start(emitter: EventEmitter): Promise<void> {
        // Listen for Stripe webhooks, emit SignalEvents
    }

    async stop(): Promise<void> {
        // Cleanup
    }
}
```

## Configuration Reference

### `SignalConfig`

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `client` | `Personize` | Yes | — | Authenticated SDK client |
| `channels` | `Channel[]` | Yes | — | At least one delivery channel |
| `sources` | `Source[]` | No | `[]` | Event sources |
| `scheduler` | `Scheduler` | No | `CronScheduler` | Scheduler implementation |
| `engine` | `EngineConfig` | No | See below | Engine configuration |

### `EngineConfig`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `memorize` | `boolean` | `true` | Record sent notifications in memory |
| `concurrency` | `number` | `5` | Max parallel evaluations |
| `dailyCap` | `number` | `5` | Max notifications per email per day |
| `deduplicationWindowMs` | `number` | `21600000` (6h) | Dedup window in ms |
| `maxEvaluationsPerMinute` | `number` | `20` | Rate limit for batch operations |
| `workspaceUpdates` | `boolean` | `false` | Create workspace entries on SEND/DEFER |

## Examples

See the [examples/](examples/) directory:

- **[quickstart/](examples/quickstart/)** — Minimal setup: one source, one channel
- **[saas-onboarding/](examples/saas-onboarding/)** — Signup-to-nurture-to-convert sequence
- **[sales-alerts/](examples/sales-alerts/)** — Usage drop alerts to sales team
- **[weekly-digest/](examples/weekly-digest/)** — Deferred items compiled into weekly digest
- **[multi-team/](examples/multi-team/)** — Product + Sales + Marketing on same records

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Your Application                                        │
│  ┌─────────┐  ┌───────────┐  ┌────────────┐             │
│  │ Sources  │  │  Signal   │  │  Channels  │             │
│  │ ──────── │  │  Engine   │  │  ────────  │             │
│  │ Manual   │─>│ (9 steps) │─>│ SES        │             │
│  │ Webhook  │  │           │  │ SendGrid   │             │
│  │ HubSpot* │  │ Pre-check │  │ Slack      │             │
│  │ Stripe*  │  │ Context   │  │ InApp      │             │
│  └─────────┘  │ Decision  │  │ Twilio*    │             │
│               │ Deliver   │  └────────────┘             │
│               │ Feedback  │                              │
│               └─────┬─────┘                              │
│                     │                                    │
│               ┌─────┴─────┐                              │
│               │ Personize │  * = community-contributed   │
│               │    SDK    │                              │
│               │ ───────── │                              │
│               │ Memory    │                              │
│               │ Governance│                              │
│               │ AI        │                              │
│               └───────────┘                              │
└──────────────────────────────────────────────────────────┘
```

**Core (Personize SDK — not pluggable):** Memory, Intelligence, Governance, Workspaces

**Edges (modular — community contributes):** Channels, Sources, Schedulers

## License

Apache-2.0 — see [LICENSE](LICENSE).

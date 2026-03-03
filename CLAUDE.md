# @personize/signal

## What This Package Is
Smart notification engine built on @personize/sdk. Decides IF, WHAT, WHEN, and HOW to notify each person using unified memory and governance guardrails. Delivery channels and event sources are modular — the core intelligence is Personize.

## Key Concepts
- **Source**: produces SignalEvents (webhooks, CRM events, manual triggers)
- **Channel**: delivers messages (email, Slack, in-app, SMS)
- **Engine**: orchestration loop (trigger → pre-check → context assembly → AI decision → deliver → feedback)
- **Workspace**: convenience methods over SDK workspace tag patterns (tasks, notes, updates, issues)
- **Digest**: compiles deferred notifications into periodic personalized digests

## Structure
- `src/signal.ts` — main entry point class
- `src/engine.ts` — orchestration loop (the core logic)
- `src/types.ts` — all interfaces and types
- `src/errors.ts` — error hierarchy
- `src/channels/` — built-in channel implementations (SES, SendGrid, Slack, InApp, Console)
- `src/sources/` — built-in source implementations (Manual, Webhook)
- `src/schedulers/` — scheduler implementations (CronScheduler)
- `src/workspace/` — workspace utility methods
- `src/digest/` — digest builder for compiling deferred notifications
- `templates/` — contribution templates for new channels and sources

## Adding a New Channel
1. Create `src/channels/my-channel.ts`
2. Implement the `Channel` interface: `{ name: string; send(recipient, payload): Promise<DeliveryResult> }`
3. Export from `src/channels/index.ts`
4. Export from `src/index.ts`

## Adding a New Source
1. Create `src/sources/my-source.ts`
2. Implement the `Source` interface: `{ name: string; start(emitter): Promise<void>; stop(): Promise<void> }`
3. Call `emitter.emit('event', signalEvent)` when events occur
4. Export from `src/sources/index.ts`
5. Export from `src/index.ts`

## Engine Flow (9 steps)
1. Receive SignalEvent
2. Pre-check (dedup + daily cap — no SDK calls)
3. Context assembly (4 parallel SDK calls: smartContext, smartDigest, 2x smartRecall)
4. AI decision via prompt (SEND/DEFER/SKIP with scoring)
5. Decision routing
6. Deliver (if SEND)
7. Workspace update (if configured)
8. Feedback memorization
9. Return EngineResult

## SDK Methods Used
- `client.ai.smartContext()` — governance rules
- `client.memory.smartDigest()` — compiled entity context
- `client.memory.smartRecall()` — semantic memory search
- `client.ai.prompt()` — AI decision + content generation
- `client.memory.memorize()` — feedback loop + workspace writes

## Testing
Jest with mocked @personize/sdk. No real API calls in tests.
`npm test` to run, `npm run test:coverage` for coverage report.

## Build
`npm run build` compiles to `dist/` with type declarations.

import type { Personize } from '@personize/sdk';
import type {
    SignalEvent,
    EngineResult,
    EngineConfig,
    Channel,
    Recipient,
    DeliveryResult,
} from './types';
import type { WorkspaceUtils } from './workspace/workspace';
import { EngineError } from './errors';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_DAILY_CAP = 5;
const DEFAULT_DEDUP_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours
const DEFAULT_CONCURRENCY = 5;
const DEFAULT_MAX_EVALS_PER_MINUTE = 20;
const SEND_THRESHOLD = 60;
const DEFER_THRESHOLD = 40;

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class Engine {
    private client: Personize;
    private channels: Channel[];
    private config: Required<EngineConfig>;
    private workspace?: WorkspaceUtils;

    /** Dedup cache: `${email}:${eventType}` → timestamp of last send */
    private dedupCache = new Map<string, number>();
    /** Daily cap counter: `${email}:${dateStr}` → count */
    private dailyCapCounter = new Map<string, number>();
    /** Active concurrent evaluations */
    private activeEvaluations = 0;

    constructor(
        client: Personize,
        channels: Channel[],
        config?: EngineConfig,
        workspace?: WorkspaceUtils,
    ) {
        this.client = client;
        this.channels = channels;
        this.workspace = workspace;
        this.config = {
            memorize: config?.memorize ?? true,
            concurrency: config?.concurrency ?? DEFAULT_CONCURRENCY,
            dailyCap: config?.dailyCap ?? DEFAULT_DAILY_CAP,
            deduplicationWindowMs: config?.deduplicationWindowMs ?? DEFAULT_DEDUP_WINDOW_MS,
            maxEvaluationsPerMinute: config?.maxEvaluationsPerMinute ?? DEFAULT_MAX_EVALS_PER_MINUTE,
            workspaceUpdates: config?.workspaceUpdates ?? false,
        };
    }

    /**
     * Evaluate a single event through the full engine pipeline.
     *
     * Flow:
     * 1. Pre-check (dedup + daily cap — no SDK calls)
     * 2. Context assembly (4 parallel SDK calls)
     * 3. Context gate (auto-SKIP routine events with no assembled context — 0 AI tokens)
     * 4. AI decision (prompt with structured outputs)
     * 5. Decision routing (SEND / DEFER / SKIP)
     * 6. Deliver (if SEND)
     * 7. Workspace update (if configured)
     * 8. Feedback memorization
     *
     * Cost profile per call:
     *   Pre-check SKIP (dedup/daily cap):         0 SDK calls, 0 AI tokens
     *   Context gate SKIP (routine + no context): 4 SDK calls, 0 AI tokens
     *   Full evaluation (SEND/DEFER/SKIP):        5 SDK calls, ~10K–15K tokens (~$0.004)
     *
     * Production recommendation: set SIGNAL_EVALUATE=false in the host platform.
     * When false, emitEvent() returns early and this method is never called.
     * Use SIGNAL_EVALUATE=true only for notification quality tuning and optimization.
     */
    async evaluate(event: SignalEvent): Promise<EngineResult> {
        const startTime = Date.now();
        let sdkCallsUsed = 0;

        try {
            // ---------------------------------------------------------------
            // Step 1: PRE-CHECK (fast skip — no SDK calls)
            // ---------------------------------------------------------------
            const preCheckResult = this.preCheck(event);
            if (preCheckResult) {
                return { ...preCheckResult, sdkCallsUsed: 0, durationMs: Date.now() - startTime };
            }

            // ---------------------------------------------------------------
            // Step 2: CONTEXT ASSEMBLY (4 parallel SDK calls)
            // ---------------------------------------------------------------
            const [governanceResult, digestResult, triggerRecallResult, sentRecallResult] =
                await Promise.allSettled([
                    this.client.ai.smartGuidelines({
                        message: `notification rules for: ${event.type}`,
                        mode: 'fast',
                    }),
                    this.client.memory.smartDigest({
                        email: event.email,
                        type: 'Contact',
                        token_budget: 2000,
                        include_properties: true,
                        include_memories: true,
                    }),
                    this.client.memory.smartRecall({
                        query: `${event.type}: ${JSON.stringify(event.data).substring(0, 200)}`,
                        email: event.email,
                        fast_mode: true,
                        limit: 10,
                    }),
                    this.client.memory.smartRecall({
                        query: 'recent notifications sent signal:sent',
                        email: event.email,
                        fast_mode: true,
                        limit: 5,
                    }),
                ]);

            sdkCallsUsed += 4;

            // Assemble context sections
            const sections: string[] = [];

            if (governanceResult.status === 'fulfilled' && governanceResult.value.data?.compiledContext) {
                sections.push('## Notification Guidelines\n' + governanceResult.value.data.compiledContext);
            }

            if (digestResult.status === 'fulfilled' && digestResult.value.data?.compiledContext) {
                sections.push('## Everything We Know About This Person\n' + digestResult.value.data.compiledContext);
            }

            if (triggerRecallResult.status === 'fulfilled') {
                const memories = triggerRecallResult.value.data;
                if (Array.isArray(memories) && memories.length > 0) {
                    sections.push(
                        '## Relevant Context for This Event\n' +
                        memories.map((m: any) => `- ${m.text || m.content || JSON.stringify(m)}`).join('\n'),
                    );
                }
            }

            if (sentRecallResult.status === 'fulfilled') {
                const sentMemories = sentRecallResult.value.data;
                if (Array.isArray(sentMemories) && sentMemories.length > 0) {
                    sections.push(
                        '## Recently Sent Notifications (avoid repetition)\n' +
                        sentMemories.map((m: any) => `- ${m.text || m.content || JSON.stringify(m)}`).join('\n'),
                    );
                }
            }

            const assembledContext = sections.join('\n\n---\n\n');

            // ---------------------------------------------------------------
            // Context gate: skip AI evaluation for routine events with no context.
            // Routine events (user.login) always SKIP when there is nothing to
            // personalise with — no need to spend tokens confirming this.
            // ---------------------------------------------------------------
            const ROUTINE_EVENT_TYPES = new Set(['user.login']);
            if (!assembledContext && ROUTINE_EVENT_TYPES.has(event.type)) {
                return {
                    action: 'SKIP',
                    score: 0,
                    reasoning: `No context available for routine ${event.type} — skipping AI evaluation`,
                    sdkCallsUsed,
                    durationMs: Date.now() - startTime,
                };
            }

            // ---------------------------------------------------------------
            // Step 3: AI DECISION (prompt with multi-step instructions)
            // ---------------------------------------------------------------
            const aiResult = await this.client.ai.prompt({
                context: assembledContext,
                instructions: [
                    {
                        prompt: `A notification was triggered for this person.

Trigger type: "${event.type}"
Trigger data: ${JSON.stringify(event.data).substring(0, 500)}
Timestamp: ${event.timestamp}

Evaluate whether this warrants a notification:
1. Is this trigger meaningful to THIS specific person based on their context, role, and history?
2. Have we already notified them about something similar recently? (Check the "Recently Sent" section above)
3. Is there a unique angle we can take that a generic notification cannot?
4. Is the timing appropriate?

Score this notification 0-100:
- NEWNESS (0-25): Is this new information they don't already know?
- RELEVANCE (0-25): How relevant is this to their role, goals, or current work?
- ACTIONABILITY (0-25): Can they take a specific action based on this?
- TIMELINESS (0-25): Is NOW the right time to tell them?

Respond with:
<output name="score">[0-100 total score]</output>
<output name="reasoning">[One sentence explaining your scoring]</output>`,
                        maxSteps: 2,
                    },
                    {
                        prompt: `Based on your evaluation score:
- If score >= ${SEND_THRESHOLD}: decide to SEND. Choose the best channel and write the notification.
- If score ${DEFER_THRESHOLD}-${SEND_THRESHOLD - 1}: decide to DEFER for a digest.
- If score < ${DEFER_THRESHOLD}: decide to SKIP.

If SEND or DEFER, generate personalized content:
- Reference at least 2 specific facts about this person (not just their name)
- Connect the trigger to their context
- Include a specific, actionable next step
- Keep it concise: under 200 words
- Sound like a knowledgeable colleague, not a marketing tool
- If email: include a subject line

Respond with:
<output name="decision">[SEND or DEFER or SKIP]</output>
<output name="channel">[email or slack or in-app — only if SEND]</output>
<output name="priority">[immediate or standard or digest]</output>
<output name="subject">[subject line — only if email]</output>
<output name="body">[notification body text]</output>`,
                        maxSteps: 3,
                    },
                ],
                outputs: [
                    { name: 'score' },
                    { name: 'reasoning' },
                    { name: 'decision' },
                    { name: 'channel' },
                    { name: 'priority' },
                    { name: 'subject' },
                    { name: 'body' },
                ],
            });

            sdkCallsUsed += 1;

            // Parse AI outputs
            const outputs = aiResult.data?.outputs || {};
            const score = parseInt(String(outputs.score || '0'), 10);
            const reasoning = String(outputs.reasoning || '');
            const decision = String(outputs.decision || 'SKIP').toUpperCase() as 'SEND' | 'DEFER' | 'SKIP';
            const channelName = String(outputs.channel || 'email').toLowerCase();
            const priority = String(outputs.priority || 'standard').toLowerCase() as 'immediate' | 'standard' | 'digest';
            const subject = outputs.subject ? String(outputs.subject) : undefined;
            const body = String(outputs.body || '');

            // ---------------------------------------------------------------
            // Step 4: DECISION ROUTING
            // ---------------------------------------------------------------

            if (decision === 'SKIP' || score < DEFER_THRESHOLD) {
                return {
                    action: 'SKIP',
                    score,
                    reasoning,
                    sdkCallsUsed,
                    durationMs: Date.now() - startTime,
                };
            }

            if (decision === 'DEFER' || (score >= DEFER_THRESHOLD && score < SEND_THRESHOLD)) {
                // Memorize as deferred for later digest compilation
                if (this.config.memorize) {
                    await (this.client.memory.memorize as any)({
                        type: 'Contact',
                        memories: [{ text: `[SIGNAL:DEFERRED] Event: ${event.type}. Score: ${score}. ` +
                            `Reasoning: ${reasoning}. Content: ${body.substring(0, 300)}` }],
                        email: event.email,
                        enhanced: true,
                        tags: ['signal:deferred', 'signal:pending-digest', `trigger:${event.type}`],
                        speaker: 'System: Signal Engine',
                        timestamp: new Date().toISOString(),
                    });
                    sdkCallsUsed += 1;
                }

                // Optionally create a workspace task for review
                if (this.config.workspaceUpdates && this.workspace) {
                    await this.workspace.addTask(event.email, {
                        title: `Review deferred: ${event.type}`,
                        description: reasoning,
                        priority: 'low',
                    }).catch(() => {}); // fire-and-forget
                    sdkCallsUsed += 1;
                }

                return {
                    action: 'DEFER',
                    score,
                    reasoning,
                    priority: 'digest',
                    content: { subject, body },
                    sdkCallsUsed,
                    durationMs: Date.now() - startTime,
                };
            }

            // ---------------------------------------------------------------
            // Step 5: DELIVER
            // ---------------------------------------------------------------
            const channel = this.resolveChannel(channelName);
            const recipient: Recipient = { email: event.email };
            let delivery: DeliveryResult | undefined;

            if (channel) {
                delivery = await channel.send(recipient, {
                    subject,
                    body,
                    priority,
                });
            }

            // ---------------------------------------------------------------
            // Step 6: WORKSPACE UPDATE
            // ---------------------------------------------------------------
            if (this.config.workspaceUpdates && this.workspace) {
                this.workspace.addUpdate(
                    event.email,
                    `[SIGNAL] Notification sent: ${subject || event.type} via ${channelName}`,
                ).catch(() => {}); // fire-and-forget
            }

            // ---------------------------------------------------------------
            // Step 7: FEEDBACK MEMORIZATION
            // ---------------------------------------------------------------
            if (this.config.memorize) {
                (this.client.memory.memorize as any)({
                    type: 'Contact',
                    memories: [{ text: `[SIGNAL:SENT] Notification via ${channelName} on ${new Date().toISOString()}. ` +
                        `Trigger: ${event.type}. Score: ${score}. Priority: ${priority}. ` +
                        `Subject: ${subject || 'N/A'}. ` +
                        `Content: ${body.substring(0, 300)}. ` +
                        `Reasoning: ${reasoning}` }],
                    email: event.email,
                    enhanced: true,
                    tags: ['signal:sent', `channel:${channelName}`, `trigger:${event.type}`, `priority:${priority}`],
                    speaker: 'System: Signal Engine',
                    timestamp: new Date().toISOString(),
                }).catch(() => {}); // fire-and-forget — don't block on feedback
                sdkCallsUsed += 1;
            }

            // Update dedup cache
            this.dedupCache.set(`${event.email}:${event.type}`, Date.now());
            this.incrementDailyCap(event.email);

            return {
                action: 'SEND',
                score,
                reasoning,
                channel: channelName,
                priority,
                delivery,
                content: { subject, body },
                sdkCallsUsed,
                durationMs: Date.now() - startTime,
            };

        } catch (err) {
            throw new EngineError(
                `Engine evaluation failed for event ${event.id}: ${err instanceof Error ? err.message : String(err)}`,
                { eventId: event.id, cause: err instanceof Error ? err : undefined },
            );
        }
    }

    // -----------------------------------------------------------------------
    // Pre-check: fast skip without SDK calls
    // -----------------------------------------------------------------------

    private preCheck(event: SignalEvent): Omit<EngineResult, 'sdkCallsUsed' | 'durationMs'> | null {
        // Check deduplication window
        const dedupKey = `${event.email}:${event.type}`;
        const lastSent = this.dedupCache.get(dedupKey);
        if (lastSent && Date.now() - lastSent < this.config.deduplicationWindowMs) {
            return {
                action: 'SKIP',
                score: 0,
                reasoning: `Dedup: same event type sent to ${event.email} within deduplication window`,
            };
        }

        // Check daily cap
        const capKey = `${event.email}:${new Date().toISOString().split('T')[0]}`;
        const todayCount = this.dailyCapCounter.get(capKey) || 0;
        if (todayCount >= this.config.dailyCap) {
            return {
                action: 'SKIP',
                score: 0,
                reasoning: `Daily cap: ${event.email} has received ${todayCount}/${this.config.dailyCap} notifications today`,
            };
        }

        return null; // passed pre-check, continue to full evaluation
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private resolveChannel(name: string): Channel | undefined {
        return this.channels.find(c => c.name === name) || this.channels[0];
    }

    private incrementDailyCap(email: string): void {
        const capKey = `${email}:${new Date().toISOString().split('T')[0]}`;
        this.dailyCapCounter.set(capKey, (this.dailyCapCounter.get(capKey) || 0) + 1);
    }

    /** Clear stale entries from dedup and daily cap caches (call periodically) */
    cleanCaches(): void {
        const now = Date.now();
        const today = new Date().toISOString().split('T')[0];

        // Clear expired dedup entries
        for (const [key, timestamp] of this.dedupCache) {
            if (now - timestamp > this.config.deduplicationWindowMs) {
                this.dedupCache.delete(key);
            }
        }

        // Clear yesterday's daily cap entries
        for (const key of this.dailyCapCounter.keys()) {
            if (!key.endsWith(today)) {
                this.dailyCapCounter.delete(key);
            }
        }
    }
}

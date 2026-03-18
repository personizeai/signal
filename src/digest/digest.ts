import type { Personize } from '@personize/sdk';
import type { Channel, DigestResult, BatchDigestResult } from '../types';

/**
 * DigestBuilder: compiles deferred notifications into periodic digests.
 *
 * Deferred items are stored in Personize memory with `signal:deferred` tags.
 * The digest builder recalls them, compiles a personalized summary using
 * the AI prompt, and delivers the compiled digest.
 */
export class DigestBuilder {
    constructor(
        private client: Personize,
        private channels: Channel[],
    ) {}

    /**
     * Build and deliver a digest for a single user.
     * Returns null if there are no deferred items to compile.
     */
    async buildForUser(email: string, options?: {
        maxItems?: number;
        tokenBudget?: number;
        channelName?: string;
    }): Promise<DigestResult | null> {
        const startTime = Date.now();
        let sdkCallsUsed = 0;
        const maxItems = options?.maxItems ?? 20;
        const tokenBudget = options?.tokenBudget ?? 2000;

        // 1. Recall deferred items
        const deferred = await this.client.memory.smartRecall({
            query: 'deferred notifications pending digest signal:deferred signal:pending-digest',
            email,
            limit: maxItems,
            fast_mode: true,
        });
        sdkCallsUsed += 1;

        const deferredItems = deferred.data;
        if (!Array.isArray(deferredItems) || deferredItems.length === 0) {
            return null;
        }

        // 2. Get full user context + governance
        const [digestResult, governanceResult] = await Promise.allSettled([
            this.client.memory.smartDigest({
                email,
                type: 'Contact',
                token_budget: tokenBudget,
                include_properties: true,
                include_memories: true,
            }),
            this.client.ai.smartGuidelines({
                message: 'digest compilation guidelines, notification frequency policy',
                mode: 'fast',
            }),
        ]);
        sdkCallsUsed += 2;

        // Assemble context
        const sections: string[] = [];

        if (governanceResult.status === 'fulfilled' && governanceResult.value.data?.compiledContext) {
            sections.push('## Guidelines\n' + governanceResult.value.data.compiledContext);
        }

        if (digestResult.status === 'fulfilled' && digestResult.value.data?.compiledContext) {
            sections.push('## About This Person\n' + digestResult.value.data.compiledContext);
        }

        sections.push(
            '## Deferred Notifications to Compile\n' +
            deferredItems.map((item: any, i: number) =>
                `${i + 1}. ${item.text || item.content || JSON.stringify(item)}`,
            ).join('\n'),
        );

        const context = sections.join('\n\n---\n\n');

        // 3. Compile digest via AI prompt
        const aiResult = await this.client.ai.prompt({
            context,
            instructions: [
                {
                    prompt: `You have ${deferredItems.length} deferred notification items for this person.
Compile them into a single, personalized digest email.

Rules:
- Group related items together
- Prioritize by importance to THIS person (use their context)
- Reference specific facts about them — make the digest feel personal
- Keep total length under 400 words
- Each section should have a clear heading
- End with a prioritized "Action Items" list
- Be concise — this is a digest, not individual notifications

Respond with:
<output name="subject">[email subject line for the digest]</output>
<output name="body">[plain text digest body]</output>
<output name="htmlBody">[HTML formatted digest with headings and bullet points]</output>`,
                    maxSteps: 3,
                },
            ],
            outputs: [
                { name: 'subject' },
                { name: 'body' },
                { name: 'htmlBody' },
            ],
        });
        sdkCallsUsed += 1;

        const outputs = aiResult.data?.outputs || {};
        const subject = String(outputs.subject || 'Your Weekly Digest');
        const body = String(outputs.body || '');
        const htmlBody = outputs.htmlBody ? String(outputs.htmlBody) : undefined;

        // 4. Deliver the digest
        const channelName = options?.channelName || 'email';
        const channel = this.channels.find(c => c.name === channelName)
            || this.channels.find(c => c.name === 'ses')
            || this.channels.find(c => c.name === 'sendgrid')
            || this.channels[0];

        let delivery;
        if (channel) {
            delivery = await channel.send(
                { email },
                { subject, body, htmlBody, priority: 'digest' },
            );
        }

        const delivered = delivery?.success !== false;

        // 5. Memorize digest outcome
        const status = delivered ? 'compiled and sent' : `compiled but delivery failed (${delivery?.error || 'unknown'})`;
        (this.client.memory.memorize as any)({
            type: 'Contact',
            memories: [{ text: `[SIGNAL:DIGEST] Digest ${status} on ${new Date().toISOString()}. ` +
                `Items compiled: ${deferredItems.length}. Subject: ${subject}. ` +
                `Content summary: ${body.substring(0, 200)}` }],
            email,
            enhanced: true,
            tags: ['signal:digest', 'channel:digest', ...(delivered ? ['signal:sent'] : ['signal:failed'])],
            speaker: 'System: Signal Digest',
            timestamp: new Date().toISOString(),
        }).catch(() => {}); // fire-and-forget

        if (!delivered) {
            console.warn(`[DigestBuilder] Digest delivery failed for ${email}:`, delivery?.error);
        }

        return {
            email,
            itemsCompiled: deferredItems.length,
            delivery,
            delivered,
            sdkCallsUsed,
            durationMs: Date.now() - startTime,
        };
    }

    /**
     * Build and deliver a behavioral digest for a single user (production mode).
     *
     * Used when SIGNAL_EVALUATE=false — no deferred items exist because per-event
     * AI evaluation is disabled. Instead, compiles behavioral memories written by
     * the behavior-memorizer into a personalized weekly insight notification.
     *
     * Returns null if the user has no behavioral context yet (nothing to surface).
     *
     * Uses 3 SDK calls per user.
     */
    async buildBehavioralDigest(email: string, options?: {
        tokenBudget?: number;
        channelName?: string;
    }): Promise<DigestResult | null> {
        const startTime = Date.now();
        let sdkCallsUsed = 0;
        const tokenBudget = options?.tokenBudget ?? 2000;

        // 1. Get compiled behavioral context
        const digestResult = await this.client.memory.smartDigest({
            email,
            type: 'Contact',
            token_budget: tokenBudget,
            include_properties: false,
            include_memories: true,
        });
        sdkCallsUsed += 1;

        const context = (digestResult as any).data?.compiledContext || '';
        if (!context.trim()) {
            return null; // No behavioral memories yet — nothing to surface
        }

        // 2. Get governance/tone guidelines
        const guidelinesResult = await this.client.ai.smartGuidelines({
            message: 'weekly behavioral digest notification tone and format rules',
            mode: 'fast',
        });
        sdkCallsUsed += 1;
        const guidelines = (guidelinesResult as any).data?.compiledContext || '';

        // 3. ONE AI call to generate digest
        const fullContext = [guidelines, `## What Signal Knows About This User\n${context}`]
            .filter(Boolean)
            .join('\n\n---\n\n');

        const aiResult = await this.client.ai.prompt({
            context: fullContext,
            instructions: [{
                prompt: `Based on what you know about this user's recent platform activity, generate a brief weekly digest notification.

Rules:
- Reference at least 2 specific behaviors or patterns you observed (be concrete, not generic)
- Suggest ONE actionable next step based on their actual usage patterns
- Sound like a knowledgeable colleague, not a marketing tool
- Under 150 words for in-app delivery
- If there is nothing genuinely useful to surface (no real patterns, no activity), set skip=true

Respond with:
<output name="skip">true or false</output>
<output name="subject">Short notification title (under 60 chars)</output>
<output name="body">Notification body text</output>`,
                maxSteps: 1,
            }],
            outputs: [{ name: 'skip' }, { name: 'subject' }, { name: 'body' }],
        });
        sdkCallsUsed += 1;

        const outputs = (aiResult as any).data?.outputs || {};
        if (String(outputs.skip).toLowerCase() === 'true') {
            return null;
        }

        const subject = String(outputs.subject || 'Your weekly Personize summary');
        const body = String(outputs.body || '');
        if (!body) return null;

        // 4. Deliver via in-app channel (preferred for digest), fallback to first channel
        const channelName = options?.channelName || 'in-app';
        const channel = this.channels.find(c => c.name === channelName)
            || this.channels.find(c => c.name === 'ses')
            || this.channels[0];

        let delivery;
        if (channel) {
            delivery = await channel.send(
                { email },
                { subject, body, priority: 'digest' },
            );
        }

        const delivered = delivery?.success !== false;

        // 5. Memorize digest outcome
        const status = delivered ? 'Sent' : `Failed (${delivery?.error || 'unknown'})`;
        (this.client.memory.memorize as any)({
            type: 'Contact',
            memories: [{ text: `[SIGNAL:BEHAVIORAL-DIGEST] ${status} on ${new Date().toISOString()}. Subject: ${subject}.` }],
            email,
            enhanced: false,
            tags: ['signal:digest', 'signal:behavioral-digest', ...(delivered ? ['signal:sent'] : ['signal:failed'])],
            speaker: 'System: Signal Digest',
            timestamp: new Date().toISOString(),
        }).catch(() => {});

        if (!delivered) {
            console.warn(`[DigestBuilder] Behavioral digest delivery failed for ${email}:`, delivery?.error);
        }

        return {
            email,
            itemsCompiled: 1,
            delivery,
            delivered,
            sdkCallsUsed,
            durationMs: Date.now() - startTime,
        };
    }

    /**
     * Run behavioral digest for a batch of users (production mode).
     * Processes sequentially with delays for rate limit control.
     */
    async runBehavioralBatch(emails: string[], options?: {
        tokenBudget?: number;
        channelName?: string;
        delayBetweenMs?: number;
    }): Promise<BatchDigestResult> {
        const delayMs = options?.delayBetweenMs ?? 2000;
        const results: DigestResult[] = [];
        let sent = 0;
        let skipped = 0;
        let errors = 0;

        for (const email of emails) {
            try {
                const result = await this.buildBehavioralDigest(email, options);
                if (result) {
                    results.push(result);
                    if (result.delivered === false) {
                        errors++;
                        console.error(`[DigestBuilder] Behavioral digest compiled but delivery failed for ${email}`);
                    } else {
                        sent++;
                    }
                } else {
                    skipped++;
                }
            } catch (err) {
                errors++;
                console.error(`[DigestBuilder] Behavioral digest failed for ${email}:`, err instanceof Error ? err.message : err);
            }

            if (delayMs > 0) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }

        return { sent, skipped, errors, results };
    }

    /**
     * Run digest for a batch of users.
     * Processes sequentially with delays for rate limit control.
     */
    async runBatch(emails: string[], options?: {
        maxItems?: number;
        tokenBudget?: number;
        channelName?: string;
        delayBetweenMs?: number;
    }): Promise<BatchDigestResult> {
        const delayMs = options?.delayBetweenMs ?? 2000;
        const results: DigestResult[] = [];
        let sent = 0;
        let skipped = 0;
        let errors = 0;

        for (const email of emails) {
            try {
                const result = await this.buildForUser(email, options);
                if (result) {
                    results.push(result);
                    sent++;
                } else {
                    skipped++;
                }
            } catch (err) {
                errors++;
                console.error(`[DigestBuilder] Failed for ${email}:`, err instanceof Error ? err.message : err);
            }

            // Rate limit delay between users
            if (delayMs > 0) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }

        return { sent, skipped, errors, results };
    }
}

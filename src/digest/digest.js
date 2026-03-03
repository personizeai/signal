"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DigestBuilder = void 0;
/**
 * DigestBuilder: compiles deferred notifications into periodic digests.
 *
 * Deferred items are stored in Personize memory with `signal:deferred` tags.
 * The digest builder recalls them, compiles a personalized summary using
 * the AI prompt, and delivers the compiled digest.
 */
class DigestBuilder {
    constructor(client, channels) {
        this.client = client;
        this.channels = channels;
    }
    /**
     * Build and deliver a digest for a single user.
     * Returns null if there are no deferred items to compile.
     */
    async buildForUser(email, options) {
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
            this.client.ai.smartContext({
                message: 'digest compilation guidelines, notification frequency policy',
                mode: 'fast',
            }),
        ]);
        sdkCallsUsed += 2;
        // Assemble context
        const sections = [];
        if (governanceResult.status === 'fulfilled' && governanceResult.value.data?.compiledContext) {
            sections.push('## Guidelines\n' + governanceResult.value.data.compiledContext);
        }
        if (digestResult.status === 'fulfilled' && digestResult.value.data?.compiledContext) {
            sections.push('## About This Person\n' + digestResult.value.data.compiledContext);
        }
        sections.push('## Deferred Notifications to Compile\n' +
            deferredItems.map((item, i) => `${i + 1}. ${item.text || item.content || JSON.stringify(item)}`).join('\n'));
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
            delivery = await channel.send({ email }, { subject, body, htmlBody, priority: 'digest' });
        }
        // 5. Memorize that digest was sent
        this.client.memory.memorize({
            content: `[SIGNAL:DIGEST] Digest compiled and sent on ${new Date().toISOString()}. ` +
                `Items compiled: ${deferredItems.length}. Subject: ${subject}. ` +
                `Content summary: ${body.substring(0, 200)}`,
            email,
            enhanced: true,
            tags: ['signal:sent', 'signal:digest', 'channel:digest'],
            speaker: 'System: Signal Digest',
            timestamp: new Date().toISOString(),
        }).catch(() => { }); // fire-and-forget
        return {
            email,
            itemsCompiled: deferredItems.length,
            delivery,
            sdkCallsUsed,
            durationMs: Date.now() - startTime,
        };
    }
    /**
     * Run digest for a batch of users.
     * Processes sequentially with delays for rate limit control.
     */
    async runBatch(emails, options) {
        const delayMs = options?.delayBetweenMs ?? 2000;
        const results = [];
        let sent = 0;
        let skipped = 0;
        let errors = 0;
        for (const email of emails) {
            try {
                const result = await this.buildForUser(email, options);
                if (result) {
                    results.push(result);
                    sent++;
                }
                else {
                    skipped++;
                }
            }
            catch (err) {
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
exports.DigestBuilder = DigestBuilder;

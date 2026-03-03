import { EventEmitter } from 'events';
import type { Source, SignalEvent } from '../types';

export interface WebhookSourceConfig {
    /** Secret for webhook signature verification (optional) */
    secret?: string;
    /** Custom event parser: transform incoming request body into a SignalEvent */
    parseEvent?: (body: any) => SignalEvent | null;
}

/**
 * WebhookSource: receives events via HTTP webhook.
 *
 * Returns Express-compatible middleware that parses incoming POSTs
 * into SignalEvents and feeds them to the engine.
 *
 * Usage:
 *   const webhookSource = new WebhookSource({ secret: process.env.WEBHOOK_SECRET });
 *   const signal = new Signal({ client, channels, sources: [webhookSource] });
 *
 *   // Mount the webhook endpoint in your Express app:
 *   app.post('/webhooks/signal', webhookSource.middleware());
 */
export class WebhookSource implements Source {
    name = 'webhook';
    private emitter?: EventEmitter;
    private config: WebhookSourceConfig;

    constructor(config?: WebhookSourceConfig) {
        this.config = config || {};
    }

    async start(emitter: EventEmitter): Promise<void> {
        this.emitter = emitter;
    }

    async stop(): Promise<void> {
        this.emitter = undefined;
    }

    /**
     * Returns Express middleware for mounting as a webhook endpoint.
     *
     * Expects JSON body with either:
     * - A SignalEvent directly: { id, type, email, data, timestamp }
     * - A custom format parsed by the `parseEvent` config option
     */
    middleware(): (req: any, res: any) => void {
        return (req: any, res: any) => {
            try {
                // Verify webhook secret if configured
                if (this.config.secret) {
                    const headerSecret = req.headers['x-signal-secret'] || req.headers['x-webhook-secret'];
                    if (headerSecret !== this.config.secret) {
                        res.status(401).json({ error: 'Invalid webhook secret' });
                        return;
                    }
                }

                const body = req.body;
                let event: SignalEvent | null;

                if (this.config.parseEvent) {
                    event = this.config.parseEvent(body);
                } else {
                    // Default: expect SignalEvent shape directly
                    if (!body.id || !body.type || !body.email) {
                        res.status(400).json({ error: 'Missing required fields: id, type, email' });
                        return;
                    }
                    event = {
                        id: body.id,
                        type: body.type,
                        email: body.email,
                        data: body.data || {},
                        timestamp: body.timestamp || new Date().toISOString(),
                        metadata: body.metadata,
                    };
                }

                if (event && this.emitter) {
                    this.emitter.emit('event', event);
                    res.status(202).json({ accepted: true, eventId: event.id });
                } else {
                    res.status(200).json({ accepted: false, reason: 'Event filtered or source not started' });
                }
            } catch (err) {
                console.error('[WebhookSource] Error processing webhook:', err instanceof Error ? err.message : err);
                res.status(500).json({ error: 'Internal processing error' });
            }
        };
    }
}

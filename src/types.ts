import { EventEmitter } from 'events';
import type { Personize } from '@personize/sdk';

// ---------------------------------------------------------------------------
// Core Interfaces — These are the extension points for community contributions
// ---------------------------------------------------------------------------

/**
 * Source: produces SignalEvents from external systems.
 *
 * Built-in: ManualSource (programmatic), WebhookSource (Express middleware)
 * Community: HubSpotSource, SalesforceSource, StripeSource, SegmentSource, etc.
 */
export interface Source {
    /** Unique name for this source (e.g., 'webhook', 'hubspot', 'manual') */
    name: string;
    /** Start listening for events. Call emitter.emit('event', SignalEvent) to feed events to the engine. */
    start(emitter: EventEmitter): Promise<void>;
    /** Gracefully stop listening */
    stop(): Promise<void>;
}

/**
 * Channel: delivers messages to recipients.
 *
 * Built-in: ConsoleChannel (dev), SesChannel, SendGridChannel, SlackChannel, InAppChannel
 * Community: TwilioChannel, DiscordChannel, TeamsChannel, WhatsAppChannel, etc.
 */
export interface Channel {
    /** Unique name (e.g., 'sendgrid', 'slack', 'ses', 'in-app', 'console') */
    name: string;
    /** Send a message through this channel */
    send(recipient: Recipient, payload: DeliveryPayload): Promise<DeliveryResult>;
}

/**
 * Scheduler: runs recurring jobs.
 *
 * Built-in: CronScheduler (node-cron)
 * Community: BullMQScheduler, TemporalScheduler, EventBridgeScheduler, etc.
 */
export interface Scheduler {
    /** Schedule a recurring job */
    schedule(name: string, cronExpr: string, job: () => Promise<void>): void;
    /** Stop all scheduled jobs */
    stopAll(): void;
}

// ---------------------------------------------------------------------------
// Event Types
// ---------------------------------------------------------------------------

/** An event produced by a Source, evaluated by the Engine */
export interface SignalEvent {
    /** Unique event ID (e.g., ULID) */
    id: string;
    /** Event type name (e.g., 'user.signup', 'usage.milestone', 'deal.stage_changed') */
    type: string;
    /** Email of the entity this event is about */
    email: string;
    /** Structured event payload */
    data: Record<string, unknown>;
    /** ISO8601 timestamp of when the event occurred */
    timestamp: string;
    /** Optional metadata (team, source system, etc.) */
    metadata?: {
        team?: string;
        source?: string;
        [key: string]: unknown;
    };
}

// ---------------------------------------------------------------------------
// Delivery Types
// ---------------------------------------------------------------------------

export interface Recipient {
    email: string;
    name?: string;
    userId?: string;
    metadata?: Record<string, unknown>;
}

export interface DeliveryPayload {
    subject?: string;
    body: string;
    htmlBody?: string;
    priority: 'immediate' | 'standard' | 'digest';
    metadata?: Record<string, unknown>;
}

export interface DeliveryResult {
    success: boolean;
    channel: string;
    messageId?: string;
    error?: string;
    timestamp: string;
}

// ---------------------------------------------------------------------------
// Engine Types
// ---------------------------------------------------------------------------

export type EngineAction = 'SEND' | 'DEFER' | 'SKIP';

/** Result of the engine evaluating a single SignalEvent */
export interface EngineResult {
    /** What the engine decided to do */
    action: EngineAction;
    /** AI confidence score (0-100) */
    score: number;
    /** AI reasoning for the decision */
    reasoning: string;
    /** Which channel was used (if SEND) */
    channel?: string;
    /** Notification priority */
    priority?: 'immediate' | 'standard' | 'digest';
    /** Delivery result (if SEND) */
    delivery?: DeliveryResult;
    /** Generated content (if SEND or DEFER) */
    content?: {
        subject?: string;
        body?: string;
        htmlBody?: string;
    };
    /** Number of SDK API calls made during this evaluation */
    sdkCallsUsed: number;
    /** Total duration in milliseconds */
    durationMs: number;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface EngineConfig {
    /** Enable feedback memorization — records what was sent back to memory (default: true) */
    memorize?: boolean;
    /** Max parallel event evaluations (default: 5) */
    concurrency?: number;
    /** Max notifications per email per day (default: 5). Pre-check, no SDK call. */
    dailyCap?: number;
    /** Skip same event type for same email within this window in ms (default: 6 hours) */
    deduplicationWindowMs?: number;
    /** Max evaluations per minute during batch processing (default: 20) */
    maxEvaluationsPerMinute?: number;
    /** Create workspace tasks/updates on SEND/DEFER (default: false) */
    workspaceUpdates?: boolean;
}

export interface SignalConfig {
    /** Personize SDK client (already authenticated) */
    client: Personize;
    /** Delivery channels — at least one required */
    channels: Channel[];
    /** Event sources (optional — you can also use signal.trigger() directly) */
    sources?: Source[];
    /** Scheduler implementation (default: CronScheduler using node-cron) */
    scheduler?: Scheduler;
    /** Engine configuration */
    engine?: EngineConfig;
}

// ---------------------------------------------------------------------------
// Workspace Types
// ---------------------------------------------------------------------------

export interface WorkspaceTask {
    title: string;
    description?: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    assignee?: string;
    dueDate?: string;
    status?: 'pending' | 'in_progress' | 'done' | 'cancelled';
}

export interface WorkspaceNote {
    content: string;
    tags?: string[];
}

export interface WorkspaceIssue {
    title: string;
    description?: string;
    severity?: 'low' | 'medium' | 'high' | 'critical';
    status?: 'open' | 'investigating' | 'resolved';
}

// ---------------------------------------------------------------------------
// Digest Types
// ---------------------------------------------------------------------------

export interface DigestConfig {
    /** Cron expression for digest runs (default: '0 9 * * 1-5' — weekdays 9 AM) */
    cronExpr?: string;
    /** Max deferred items to include per digest (default: 20) */
    maxItems?: number;
    /** Token budget for entity context in digest compilation (default: 2000) */
    tokenBudget?: number;
}

export interface DigestResult {
    email: string;
    itemsCompiled: number;
    delivery?: DeliveryResult;
    /** Whether delivery actually succeeded (false = compiled but channel rejected) */
    delivered?: boolean;
    sdkCallsUsed: number;
    durationMs: number;
}

export interface BatchDigestResult {
    sent: number;
    skipped: number;
    errors: number;
    results: DigestResult[];
}

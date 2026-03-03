// Core
export { Signal } from './signal';
export { Engine } from './engine';

// Types
export type {
    // Interfaces
    Source,
    Channel,
    Scheduler,
    // Events
    SignalEvent,
    // Delivery
    Recipient,
    DeliveryPayload,
    DeliveryResult,
    // Engine
    EngineResult,
    EngineAction,
    EngineConfig,
    // Configuration
    SignalConfig,
    // Workspace
    WorkspaceTask,
    WorkspaceNote,
    WorkspaceIssue,
    // Digest
    DigestConfig,
    DigestResult,
    BatchDigestResult,
} from './types';

// Errors
export {
    SignalError,
    ConfigError,
    EngineError,
    DeliveryError,
    SourceError,
} from './errors';

// Built-in Sources
export { ManualSource } from './sources/manual.source';
export { WebhookSource } from './sources/webhook.source';
export type { WebhookSourceConfig } from './sources/webhook.source';

// Built-in Channels
export { ConsoleChannel } from './channels/console.channel';
export { SesChannel } from './channels/ses.channel';
export type { SesChannelConfig } from './channels/ses.channel';
export { SendGridChannel } from './channels/sendgrid.channel';
export type { SendGridChannelConfig } from './channels/sendgrid.channel';
export { SlackChannel } from './channels/slack.channel';
export type { SlackChannelConfig } from './channels/slack.channel';
export { InAppChannel } from './channels/in-app.channel';

// Built-in Scheduler
export { CronScheduler } from './schedulers/cron.scheduler';

// Utilities
export { WorkspaceUtils } from './workspace/workspace';
export { DigestBuilder } from './digest/digest';

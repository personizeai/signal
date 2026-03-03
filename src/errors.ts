/**
 * Base error class for all Signal errors.
 */
export class SignalError extends Error {
    public readonly code: string;
    public readonly cause?: Error;

    constructor(message: string, options?: { code?: string; cause?: Error }) {
        super(message);
        this.name = 'SignalError';
        this.code = options?.code || 'SIGNAL_ERROR';
        this.cause = options?.cause;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

/**
 * Thrown when Signal configuration is invalid.
 */
export class ConfigError extends SignalError {
    constructor(message: string) {
        super(message, { code: 'CONFIG_ERROR' });
        this.name = 'ConfigError';
    }
}

/**
 * Thrown when an engine evaluation fails.
 */
export class EngineError extends SignalError {
    public readonly eventId?: string;

    constructor(message: string, options?: { eventId?: string; cause?: Error }) {
        super(message, { code: 'ENGINE_ERROR', cause: options?.cause });
        this.name = 'EngineError';
        this.eventId = options?.eventId;
    }
}

/**
 * Thrown when a channel delivery fails.
 */
export class DeliveryError extends SignalError {
    public readonly channel: string;

    constructor(message: string, options: { channel: string; cause?: Error }) {
        super(message, { code: 'DELIVERY_ERROR', cause: options.cause });
        this.name = 'DeliveryError';
        this.channel = options.channel;
    }
}

/**
 * Thrown when a source fails to start or emit events.
 */
export class SourceError extends SignalError {
    public readonly source: string;

    constructor(message: string, options: { source: string; cause?: Error }) {
        super(message, { code: 'SOURCE_ERROR', cause: options.cause });
        this.name = 'SourceError';
        this.source = options.source;
    }
}

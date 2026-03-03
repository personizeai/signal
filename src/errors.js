"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SourceError = exports.DeliveryError = exports.EngineError = exports.ConfigError = exports.SignalError = void 0;
/**
 * Base error class for all Signal errors.
 */
class SignalError extends Error {
    constructor(message, options) {
        super(message);
        this.name = 'SignalError';
        this.code = options?.code || 'SIGNAL_ERROR';
        this.cause = options?.cause;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
exports.SignalError = SignalError;
/**
 * Thrown when Signal configuration is invalid.
 */
class ConfigError extends SignalError {
    constructor(message) {
        super(message, { code: 'CONFIG_ERROR' });
        this.name = 'ConfigError';
    }
}
exports.ConfigError = ConfigError;
/**
 * Thrown when an engine evaluation fails.
 */
class EngineError extends SignalError {
    constructor(message, options) {
        super(message, { code: 'ENGINE_ERROR', cause: options?.cause });
        this.name = 'EngineError';
        this.eventId = options?.eventId;
    }
}
exports.EngineError = EngineError;
/**
 * Thrown when a channel delivery fails.
 */
class DeliveryError extends SignalError {
    constructor(message, options) {
        super(message, { code: 'DELIVERY_ERROR', cause: options.cause });
        this.name = 'DeliveryError';
        this.channel = options.channel;
    }
}
exports.DeliveryError = DeliveryError;
/**
 * Thrown when a source fails to start or emit events.
 */
class SourceError extends SignalError {
    constructor(message, options) {
        super(message, { code: 'SOURCE_ERROR', cause: options.cause });
        this.name = 'SourceError';
        this.source = options.source;
    }
}
exports.SourceError = SourceError;

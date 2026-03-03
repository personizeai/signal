"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Signal = void 0;
const events_1 = require("events");
const engine_1 = require("./engine");
const workspace_1 = require("./workspace/workspace");
const digest_1 = require("./digest/digest");
const cron_scheduler_1 = require("./schedulers/cron.scheduler");
const errors_1 = require("./errors");
class Signal {
    constructor(config) {
        this.started = false;
        if (!config.client) {
            throw new errors_1.ConfigError('Personize SDK client is required');
        }
        if (!config.channels || config.channels.length === 0) {
            throw new errors_1.ConfigError('At least one delivery channel is required');
        }
        this._client = config.client;
        this.sources = config.sources || [];
        this.scheduler = config.scheduler || new cron_scheduler_1.CronScheduler();
        this.emitter = new events_1.EventEmitter();
        // Initialize workspace utilities
        this._workspace = new workspace_1.WorkspaceUtils(config.client);
        // Initialize engine with workspace reference
        this.engine = new engine_1.Engine(config.client, config.channels, config.engine, config.engine?.workspaceUpdates ? this._workspace : undefined);
        // Initialize digest builder
        this._digest = new digest_1.DigestBuilder(config.client, config.channels);
        // Wire up event emitter to engine
        this.emitter.on('event', (event) => {
            this.engine.evaluate(event).catch((err) => {
                console.error(`[Signal] Engine evaluation failed for event ${event.id}:`, err.message);
            });
        });
    }
    /** Start all sources and begin processing events */
    async start() {
        if (this.started)
            return;
        // Start all sources
        for (const source of this.sources) {
            await source.start(this.emitter);
        }
        // Start periodic cache cleanup (every hour)
        this.cacheCleanupInterval = setInterval(() => {
            this.engine.cleanCaches();
        }, 60 * 60 * 1000);
        this.started = true;
        console.log(`[Signal] Started with ${this.sources.length} source(s) and ${this.channels.length} channel(s)`);
    }
    /** Stop all sources and scheduled jobs */
    async stop() {
        if (!this.started)
            return;
        for (const source of this.sources) {
            await source.stop();
        }
        this.scheduler.stopAll();
        if (this.cacheCleanupInterval) {
            clearInterval(this.cacheCleanupInterval);
        }
        this.started = false;
        console.log('[Signal] Stopped');
    }
    /**
     * Manually trigger a notification evaluation for an event.
     * Returns the engine result synchronously (awaits completion).
     */
    async trigger(event) {
        return this.engine.evaluate(event);
    }
    /** Schedule a recurring job using the configured scheduler */
    schedule(name, cronExpr, job) {
        this.scheduler.schedule(name, cronExpr, job);
    }
    /** Access workspace utilities (addTask, addNote, getTasks, getDigest, etc.) */
    get workspace() {
        return this._workspace;
    }
    /** Access digest builder (buildForUser, runBatch) */
    get digest() {
        return this._digest;
    }
    /** Access the underlying Personize SDK client */
    get client() {
        return this._client;
    }
    /** Get the configured channels */
    get channels() {
        return this.engine['channels'];
    }
}
exports.Signal = Signal;

import { EventEmitter } from 'events';
import type { Personize } from '@personize/sdk';
import type { SignalConfig, SignalEvent, EngineResult } from './types';
import { Engine } from './engine';
import { WorkspaceUtils } from './workspace/workspace';
import { DigestBuilder } from './digest/digest';
import { CronScheduler } from './schedulers/cron.scheduler';
import { ConfigError } from './errors';

export class Signal {
    private engine: Engine;
    private sources: import('./types').Source[];
    private scheduler: import('./types').Scheduler;
    private emitter: EventEmitter;
    private _client: Personize;
    private _workspace: WorkspaceUtils;
    private _digest: DigestBuilder;
    private started = false;
    private cacheCleanupInterval?: ReturnType<typeof setInterval>;

    constructor(config: SignalConfig) {
        if (!config.client) {
            throw new ConfigError('Personize SDK client is required');
        }
        if (!config.channels || config.channels.length === 0) {
            throw new ConfigError('At least one delivery channel is required');
        }

        this._client = config.client;
        this.sources = config.sources || [];
        this.scheduler = config.scheduler || new CronScheduler();
        this.emitter = new EventEmitter();

        // Initialize workspace utilities
        this._workspace = new WorkspaceUtils(config.client);

        // Initialize engine with workspace reference
        this.engine = new Engine(
            config.client,
            config.channels,
            config.engine,
            config.engine?.workspaceUpdates ? this._workspace : undefined,
        );

        // Initialize digest builder
        this._digest = new DigestBuilder(config.client, config.channels);

        // Wire up event emitter to engine
        this.emitter.on('event', (event: SignalEvent) => {
            this.engine.evaluate(event).catch((err) => {
                console.error(`[Signal] Engine evaluation failed for event ${event.id}:`, err.message);
            });
        });
    }

    /** Start all sources and begin processing events */
    async start(): Promise<void> {
        if (this.started) return;

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
    async stop(): Promise<void> {
        if (!this.started) return;

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
    async trigger(event: SignalEvent): Promise<EngineResult> {
        return this.engine.evaluate(event);
    }

    /** Schedule a recurring job using the configured scheduler */
    schedule(name: string, cronExpr: string, job: () => Promise<void>): void {
        this.scheduler.schedule(name, cronExpr, job);
    }

    /** Access workspace utilities (addTask, addNote, getTasks, getDigest, etc.) */
    get workspace(): WorkspaceUtils {
        return this._workspace;
    }

    /** Access digest builder (buildForUser, runBatch) */
    get digest(): DigestBuilder {
        return this._digest;
    }

    /** Access the underlying Personize SDK client */
    get client(): Personize {
        return this._client;
    }

    /** Get the configured channels */
    private get channels(): import('./types').Channel[] {
        return this.engine['channels'];
    }
}

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CronScheduler = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
/**
 * CronScheduler: default scheduler using node-cron.
 *
 * This is the default scheduler used when no custom scheduler is provided.
 * For production environments with job queues, implement the Scheduler interface
 * with BullMQ, Temporal, or your preferred job queue.
 */
class CronScheduler {
    constructor() {
        this.tasks = [];
    }
    schedule(name, cronExpr, job) {
        const task = node_cron_1.default.schedule(cronExpr, async () => {
            try {
                await job();
            }
            catch (err) {
                console.error(`[CronScheduler] Job "${name}" failed:`, err instanceof Error ? err.message : err);
            }
        });
        this.tasks.push(task);
        console.log(`[CronScheduler] Scheduled "${name}" at ${cronExpr}`);
    }
    stopAll() {
        for (const task of this.tasks) {
            task.stop();
        }
        this.tasks = [];
        console.log('[CronScheduler] All jobs stopped');
    }
}
exports.CronScheduler = CronScheduler;

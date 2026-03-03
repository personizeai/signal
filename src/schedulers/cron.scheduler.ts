import cron from 'node-cron';
import type { Scheduler } from '../types';

/**
 * CronScheduler: default scheduler using node-cron.
 *
 * This is the default scheduler used when no custom scheduler is provided.
 * For production environments with job queues, implement the Scheduler interface
 * with BullMQ, Temporal, or your preferred job queue.
 */
export class CronScheduler implements Scheduler {
    private tasks: cron.ScheduledTask[] = [];

    schedule(name: string, cronExpr: string, job: () => Promise<void>): void {
        const task = cron.schedule(cronExpr, async () => {
            try {
                await job();
            } catch (err) {
                console.error(`[CronScheduler] Job "${name}" failed:`, err instanceof Error ? err.message : err);
            }
        });
        this.tasks.push(task);
        console.log(`[CronScheduler] Scheduled "${name}" at ${cronExpr}`);
    }

    stopAll(): void {
        for (const task of this.tasks) {
            task.stop();
        }
        this.tasks = [];
        console.log('[CronScheduler] All jobs stopped');
    }
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkspaceUtils = void 0;
/**
 * WorkspaceUtils: convenience methods over Personize SDK workspace patterns.
 *
 * Follows the Collaboration Skill's "patient chart" model:
 * - Tasks (workspace:tasks) — action items with status tracking
 * - Notes (workspace:notes) — observations and analysis, append-only
 * - Updates (workspace:updates) — timeline events, append-only
 * - Issues (workspace:issues) — problems and risks with status tracking
 * - Context (workspace:context) — current state, rewritten each cycle
 *
 * All methods use memorize() with structured tags so that smartDigest()
 * and smartRecall() can retrieve workspace entries.
 */
class WorkspaceUtils {
    constructor(client) {
        this.client = client;
    }
    /** Create a task on an entity's workspace */
    async addTask(email, task) {
        const payload = {
            ...task,
            status: task.status || 'pending',
            createdAt: new Date().toISOString(),
        };
        const tags = ['workspace:tasks', 'source:signal'];
        if (task.priority)
            tags.push(`priority:${task.priority}`);
        await this.client.memory.memorize({
            content: JSON.stringify(payload),
            email,
            enhanced: true,
            tags,
            speaker: 'System: Signal',
            timestamp: new Date().toISOString(),
        });
    }
    /** Add a note to an entity's workspace */
    async addNote(email, note) {
        const content = typeof note === 'string' ? note : note.content;
        const extraTags = typeof note === 'string' ? [] : (note.tags || []);
        await this.client.memory.memorize({
            content,
            email,
            enhanced: true,
            tags: ['workspace:notes', 'source:signal', ...extraTags],
            speaker: 'System: Signal',
            timestamp: new Date().toISOString(),
        });
    }
    /** Add a timeline update to an entity's workspace */
    async addUpdate(email, update) {
        await this.client.memory.memorize({
            content: update,
            email,
            enhanced: true,
            tags: ['workspace:updates', 'source:signal'],
            speaker: 'System: Signal',
            timestamp: new Date().toISOString(),
        });
    }
    /** Add an issue to an entity's workspace */
    async addIssue(email, issue) {
        const payload = {
            ...issue,
            status: issue.status || 'open',
            createdAt: new Date().toISOString(),
        };
        const tags = ['workspace:issues', 'source:signal'];
        if (issue.severity)
            tags.push(`severity:${issue.severity}`);
        await this.client.memory.memorize({
            content: JSON.stringify(payload),
            email,
            enhanced: true,
            tags,
            speaker: 'System: Signal',
            timestamp: new Date().toISOString(),
        });
    }
    /** Retrieve open tasks for an entity */
    async getTasks(email) {
        const result = await this.client.memory.smartRecall({
            query: 'tasks pending in progress action items not completed',
            email,
            limit: 20,
            fast_mode: true,
        });
        return result.data;
    }
    /** Retrieve open issues for an entity */
    async getIssues(email) {
        const result = await this.client.memory.smartRecall({
            query: 'issues problems risks open unresolved',
            email,
            limit: 20,
            fast_mode: true,
        });
        return result.data;
    }
    /** Get the full compiled workspace digest for an entity */
    async getDigest(email, tokenBudget = 2000) {
        const digest = await this.client.memory.smartDigest({
            email,
            type: 'Contact',
            token_budget: tokenBudget,
            include_properties: true,
            include_memories: true,
        });
        return digest.data?.compiledContext || '';
    }
}
exports.WorkspaceUtils = WorkspaceUtils;

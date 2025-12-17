import { redis } from './redis.js';

const TASK_INDEX = 'idx:tasks';

export async function ensureTaskSearchIndex() {
    // If index exists, do nothing
    try {
        await redis.call('FT.INFO', TASK_INDEX);
        return;
    } catch {
        // continue - create index
    }

    // Index over RedisJSON documents stored at task:<id>
    // Fields are stored at top level.
    await redis.call(
        'FT.CREATE',
        TASK_INDEX,
        'ON',
        'JSON',
        'PREFIX',
        '1',
        'task:',
        'SCHEMA',
        '$.title',
        'AS',
        'title',
        'TEXT',
        '$.subject',
        'AS',
        'subject',
        'TAG',
        '$.userId',
        'AS',
        'userId',
        'NUMERIC',
        '$.finishDate',
        'AS',
        'finishDate',
        'NUMERIC',
        '$.createdAt',
        'AS',
        'createdAt',
        'NUMERIC',
        '$.updatedAt',
        'AS',
        'updatedAt',
        'NUMERIC',
    );
}

export type TaskSearchQuery = {
    q?: string;
    subject?: string;
    userId?: number;
    limit?: number;
    offset?: number;
};

function escapeTagValue(v: string) {
    // RediSearch TAG escaping for special chars
    return v.replace(/([,\.<>\{\}\[\]"':;!@#$%^&*\(\)\-+=~\/\\\s|])/g, '\\$1');
}

export async function searchTasks(params: TaskSearchQuery) {
    const q = (params.q ?? '').trim();
    const subject = (params.subject ?? '').trim();
    const userId = params.userId;

    const parts: string[] = [];

    // Fulltext over title, plus allow prefix search.
    // If q is empty, match all.
    if (q) {
        // Quote to keep it simple; add * for prefix.
        const safe = q.replace(/(["\\])/g, '\\$1');
        parts.push(`@title:"${safe}*"`);
    } else {
        parts.push('*');
    }

    if (subject) {
        parts.push(`@subject:{${escapeTagValue(subject)}}`);
    }

    if (typeof userId === 'number' && Number.isFinite(userId)) {
        parts.push(`@userId:[${userId} ${userId}]`);
    }

    const query = parts.join(' ');
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
    const offset = Math.max(params.offset ?? 0, 0);

    // Use RETURN so we can parse JSON without extra GET calls.
    const raw = (await redis.call(
        'FT.SEARCH',
        TASK_INDEX,
        query,
        'SORTBY',
        'createdAt',
        'DESC',
        'LIMIT',
        String(offset),
        String(limit),
        'RETURN',
        '1',
        '$',
    )) as unknown;

    // Response format (Redis): [total, key1, ["$", json], key2, ["$", json], ...]
    if (!Array.isArray(raw) || raw.length < 1) return { total: 0, items: [] as unknown[] };
    const total = Number(raw[0] ?? 0);

    const items: unknown[] = [];
    for (let i = 1; i < raw.length; i += 2) {
        const fields = raw[i + 1] as unknown;
        if (!Array.isArray(fields)) continue;
        // Find the '$' entry
        const idx = fields.findIndex((x) => x === '$');
        const json = idx >= 0 ? fields[idx + 1] : null;
        if (typeof json === 'string') {
            try {
                items.push(JSON.parse(json));
            } catch {
                // ignore
            }
        }
    }

    return { total, items };
}

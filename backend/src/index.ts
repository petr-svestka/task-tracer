import express from 'express';
import cors from 'cors';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { redis } from './redis.js';
import { signJwt, verifyJwt } from './jwt.js';
import { attachSocketIo } from './socket.js';
import { appendTaskEvent } from './streams.js';

// Keys / streams required by assignment
const TASK_EVENTS_CHANNEL = 'task-events';
const NOTIFICATIONS_STREAM = 'notifications';

type AuthUser = { id: number; username: string; role?: 'student' | 'teacher' };
type User = { id: number; username: string; passwordHash: string; createdAt: number };
type Task = {
    id: string;
    userId: number;
    title: string;
    subject: string;
    completed: boolean;
    finishDate: number;
    createdAt: number;
    updatedAt: number;
};

type PublicUser = { id: number; username: string };

type ApiError = { error: string };

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

const PORT = Number(process.env.PORT || 5000);
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_TTL_SECONDS = Number(process.env.JWT_TTL_SECONDS || 60 * 60 * 24 * 7);
const TASK_TTL_SECONDS = Number(process.env.TASK_TTL_SECONDS || 60 * 60 * 24 * 30);

function now() {
    return Date.now();
}

function nextUserIdKey() {
    return 'seq:userId';
}

function userKey(id: number) {
    return `user:${id}`;
}

function userByUsernameKey(username: string) {
    return `user:byUsername:${username.toLowerCase()}`;
}

function nextTaskIdKey() {
    return 'seq:taskId';
}

function taskKey(id: string) {
    return `task:${id}`;
}

function tasksByUserKey(userId: number) {
    return `tasks:user:${userId}`; // sorted set by createdAt
}

function tasksPublicKey() {
    return 'tasks:public';
}

function taskCompletionKey(taskId: string) {
    return `task:completed:${taskId}`; // set of userIds who completed this task
}

function tokenKey(token: string) {
    return `token:${token}`; // presence indicates token is active
}

function hashPassword(password: string) {
    return createHash('sha256').update(password).digest('hex');
}

function publicUser(u: User): PublicUser {
    return { id: u.id, username: u.username };
}

async function getAuthUserFromReq(req: express.Request): Promise<{ user: AuthUser; token: string } | null> {
    const header = req.header('authorization');
    if (!header) return null;
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) return null;

    const verified = verifyJwt(token, JWT_SECRET);
    if (!verified.valid || !verified.payload) return null;
    const { sub, username, role } = verified.payload as {
        sub?: unknown;
        username?: unknown;
        role?: unknown;
    };
    if (typeof sub !== 'number' || typeof username !== 'string') return null;
    if (role !== undefined && role !== 'student' && role !== 'teacher') return null;

    const active = await redis.exists(tokenKey(token));
    if (!active) return null;

    return { user: { id: sub, username, role: (role as 'student' | 'teacher') ?? 'student' }, token };
}

function requireAuth(
    handler: (req: express.Request, res: express.Response, user: AuthUser, token: string) => Promise<void> | void,
) {
    return async (req: express.Request, res: express.Response) => {
        const auth = await getAuthUserFromReq(req);
        if (!auth) {
            res.status(401).json({ error: 'Unauthorized' } satisfies ApiError);
            return;
        }
        await handler(req, res, auth.user, auth.token);
    };
}

async function pushNotification(evt: {
    userId: number;
    type: 'task.created' | 'task.updated' | 'task.deleted' | 'task.completed';
    taskId: string;
    message: string;
    name: string;
    subject: string;
}) {
    // Redis Streams for notifications history (assignment expects Streams usage)
    await redis.xadd(
        NOTIFICATIONS_STREAM,
        '*',
        'userId',
        String(evt.userId),
        'type',
        evt.type,
        'taskId',
        evt.taskId,
        'message',
        evt.message,
        'name',
        evt.name,
        'subject',
        evt.subject,
        'ts',
        String(Date.now()),
    );

    // Also publish to Socket.IO bridge
    await redis.publish(
        TASK_EVENTS_CHANNEL,
        JSON.stringify({
            type: 'notification.created',
            userId: evt.userId,
            taskId: evt.taskId,
            message: evt.message,
            name: evt.name,
            subject: evt.subject,
        }),
    );
}

app.get('/health', async (_req, res) => {
    try {
        await redis.ping();
        res.json({ ok: true });
    } catch {
        res.status(500).json({ ok: false });
    }
});

// --- Auth ---
app.post('/auth/register', async (req, res) => {
    const { username, password, role } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string') {
        res.status(400).json({ error: 'username and password are required' } satisfies ApiError);
        return;
    }
    const uname = username.trim();
    if (!uname) {
        res.status(400).json({ error: 'username is required' } satisfies ApiError);
        return;
    }
    if (password.length < 4) {
        res.status(400).json({ error: 'password must be at least 4 characters' } satisfies ApiError);
        return;
    }

    const existingId = await redis.get(userByUsernameKey(uname));
    if (existingId) {
        res.status(409).json({ error: 'username already exists' } satisfies ApiError);
        return;
    }

    const id = await redis.incr(nextUserIdKey());
    const chosenRole = role === 'teacher' ? 'teacher' : 'student';

    const user: User & { role?: 'student' | 'teacher' } = {
        id,
        username: uname,
        passwordHash: hashPassword(password),
        role: chosenRole,
        createdAt: now(),
    };

    // Store user as RedisJSON document (Redis Stack requirement)
    await redis
        .multi()
        .call('JSON.SET', userKey(id), '$', JSON.stringify(user))
        .set(userByUsernameKey(uname), String(id))
        .exec();

    res.status(201).json(publicUser(user));
});

app.post('/auth/login', async (req, res) => {
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string') {
        res.status(400).json({ error: 'username and password are required' } satisfies ApiError);
        return;
    }

    const uname = username.trim();
    const userIdRaw = await redis.get(userByUsernameKey(uname));
    if (!userIdRaw) {
        res.status(401).json({ error: 'invalid credentials' } satisfies ApiError);
        return;
    }

    const userRaw = (await redis.call('JSON.GET', userKey(Number(userIdRaw)))) as string | null;
    if (!userRaw) {
        res.status(401).json({ error: 'invalid credentials' } satisfies ApiError);
        return;
    }

    const user = JSON.parse(userRaw) as User & { role?: 'student' | 'teacher' };
    const passHash = hashPassword(password);
    if (user.passwordHash !== passHash) {
        res.status(401).json({ error: 'invalid credentials' } satisfies ApiError);
        return;
    }

    const token = signJwt({ sub: user.id, username: user.username, role: user.role ?? 'student' }, JWT_SECRET, JWT_TTL_SECONDS);
    await redis.set(tokenKey(token), '1', 'EX', JWT_TTL_SECONDS);

    const authUser: AuthUser = { id: user.id, username: user.username, role: user.role ?? 'student' };
    res.json({ token, user: authUser });
});

app.post(
    '/auth/logout',
    requireAuth(async (_req, res, _user, token) => {
        await redis.del(tokenKey(token));
        res.json({ ok: true });
    }),
);

// --- Tasks ---
app.get(
    '/tasks',
    requireAuth(async (_req, res, user) => {
        const publicIds = await redis.zrevrange(tasksPublicKey(), 0, 200);
        const userIds = await redis.zrevrange(tasksByUserKey(user.id), 0, 200);

        const uniqueIds = Array.from(new Set([...publicIds, ...userIds]));
        if (!uniqueIds.length) {
            res.json([]);
            return;
        }

        const raws = (await Promise.all(uniqueIds.map((id) => redis.call('JSON.GET', taskKey(id))))) as Array<string | null>;
        const tasks: Task[] = [];
        for (let i = 0; i < uniqueIds.length; i++) {
            const raw = raws[i];
            if (!raw) continue;
            const t = JSON.parse(raw) as Task;
            if (publicIds.includes(t.id)) {
                if (user.role === 'teacher') {
                    tasks.push({ ...t, completed: false });
                } else {
                    const isCompleted = (await redis.sismember(taskCompletionKey(t.id), String(user.id))) === 1;
                    tasks.push({ ...t, completed: isCompleted });
                }
            } else {
                tasks.push(t);
            }
        }

        res.json(tasks);
    }),
);

app.post(
    '/tasks',
    requireAuth(async (req, res, user) => {
        const { title, subject, finishDate } = req.body ?? {};
        if (typeof title !== 'string' || typeof subject !== 'string' || typeof finishDate !== 'number') {
            res.status(400).json({ error: 'title, subject, finishDate are required' } satisfies ApiError);
            return;
        }
        // Only teachers may create global tasks
        if (user.role !== 'teacher') {
            res.status(403).json({ error: 'forbidden' } satisfies ApiError);
            return;
        }

        const id = String(await redis.incr(nextTaskIdKey()));
        const t = now();
        const task: Task = {
            id,
            userId: user.id,
            title: title.trim(),
            subject: subject.trim(),
            completed: false,
            finishDate,
            createdAt: t,
            updatedAt: t,
        };

        await redis
            .multi()
            .call('JSON.SET', taskKey(id), '$', JSON.stringify(task))
            .expire(taskKey(id), TASK_TTL_SECONDS)
            .zadd(tasksByUserKey(user.id), t, id)
            .zadd(tasksPublicKey(), t, id)
            .publish(TASK_EVENTS_CHANNEL, JSON.stringify({ type: 'task.created', userId: -1, taskId: id }))
            .exec();

        await appendTaskEvent({ type: 'task.created', userId: user.id, taskId: id });
        // broadcast notification (userId=0 means "everyone")
        await pushNotification({
            userId: 0,
            type: 'task.created',
            taskId: id,
            message: `Task created.`,
            name: task.title,
            subject: task.subject,
        });

        res.status(201).json(task);
    }),
);

app.put(
    '/tasks/:id',
    requireAuth(async (req, res, user) => {
        const id = req.params.id;
        const raw = (await redis.call('JSON.GET', taskKey(id))) as string | null;
        if (!raw) {
            res.status(404).json({ error: 'not found' } satisfies ApiError);
            return;
        }
        const current = JSON.parse(raw) as Task;
        const isPublic = (await redis.zscore(tasksPublicKey(), id)) !== null;
        // If the requester is the owner, allow full update
        const body = req.body ?? {};
        if (current.userId === user.id) {
            const { title, subject, completed, finishDate } = body;
            if (typeof title !== 'string' || typeof subject !== 'string' || typeof completed !== 'boolean' || typeof finishDate !== 'number') {
                res.status(400).json({ error: 'title, subject, completed, finishDate are required' } satisfies ApiError);
                return;
            }

            // Teachers cannot complete tasks.
            if (user.role === 'teacher' && completed === true) {
                res.status(403).json({ error: 'forbidden' } satisfies ApiError);
                return;
            }

            const updated: Task = {
                ...current,
                title: title.trim(),
                subject: subject.trim(),
                completed,
                finishDate,
                updatedAt: now(),
            };

            await redis
                .multi()
                .call('JSON.SET', taskKey(id), '$', JSON.stringify(updated))
                .expire(taskKey(id), TASK_TTL_SECONDS)
                .publish(TASK_EVENTS_CHANNEL, JSON.stringify({ type: 'task.updated', userId: -1, taskId: id }))
                .exec();

            await appendTaskEvent({ type: 'task.updated', userId: user.id, taskId: id });

            await pushNotification({
                userId: isPublic ? 0 : user.id,
                type: 'task.updated',
                taskId: id,
                message: `Task updated.`,
                name: updated.title,
                subject: updated.subject,
            });

            res.json(updated);
            return;
        }

        // Non-owner: if the task is public, allow marking completion per-user
        if (isPublic && typeof body.completed === 'boolean') {
            if (user.role === 'teacher') {
                res.status(403).json({ error: 'forbidden' } satisfies ApiError);
                return;
            }
            if (body.completed) {
                await redis.sadd(taskCompletionKey(id), String(user.id));
                await redis.expire(taskCompletionKey(id), TASK_TTL_SECONDS);
            } else {
                await redis.srem(taskCompletionKey(id), String(user.id));
            }

            await redis.publish(TASK_EVENTS_CHANNEL, JSON.stringify({ type: 'task.updated', userId: user.id, taskId: id }));
            await appendTaskEvent({ type: 'task.updated', userId: user.id, taskId: id });

            if (body.completed) {
                await pushNotification({
                    userId: user.id,
                    type: 'task.completed',
                    taskId: id,
                    message: `Task completed.`,
                    name: current.title,
                    subject: current.subject,
                });
            } else {
                await pushNotification({
                    userId: user.id,
                    type: 'task.updated',
                    taskId: id,
                    message: `Marked incomplete.`,
                    name: current.title,
                    subject: current.subject,
                });
            }

            // Return a representation for this user (completed flag reflecting their state)
            const isCompleted = (await redis.sismember(taskCompletionKey(id), String(user.id))) === 1;
            res.json({ ...current, completed: isCompleted });
            return;
        }

        res.status(403).json({ error: 'forbidden' } satisfies ApiError);
    }),
);

app.delete(
    '/tasks/:id',
    requireAuth(async (req, res, user) => {
        const id = req.params.id;
        const raw = (await redis.call('JSON.GET', taskKey(id))) as string | null;
        if (!raw) {
            res.status(404).json({ error: 'not found' } satisfies ApiError);
            return;
        }

        const task = JSON.parse(raw) as Task;
        const isPublic = (await redis.zscore(tasksPublicKey(), id)) !== null;

        if (isPublic) {
            // Only teacher owner may delete public tasks
            if (task.userId !== user.id || user.role !== 'teacher') {
                res.status(403).json({ error: 'forbidden' } satisfies ApiError);
                return;
            }

            await redis
                .multi()
                .del(taskKey(id))
                .zrem(tasksByUserKey(user.id), id)
                .zrem(tasksPublicKey(), id)
                .publish(TASK_EVENTS_CHANNEL, JSON.stringify({ type: 'task.deleted', userId: -1, taskId: id }))
                .exec();

            await appendTaskEvent({ type: 'task.deleted', userId: user.id, taskId: id });
            await pushNotification({
                userId: 0,
                type: 'task.deleted',
                taskId: id,
                message: `Task deleted.`,
                name: task.title,
                subject: task.subject,
            });

            res.json({ ok: true });
            return;
        }

        // Private task: owner may delete
        if (task.userId !== user.id) {
            res.status(403).json({ error: 'forbidden' } satisfies ApiError);
            return;
        }

        await redis
            .multi()
            .del(taskKey(id))
            .zrem(tasksByUserKey(user.id), id)
            .publish(TASK_EVENTS_CHANNEL, JSON.stringify({ type: 'task.deleted', userId: user.id, taskId: id }))
            .exec();

        await appendTaskEvent({ type: 'task.deleted', userId: user.id, taskId: id });
        await pushNotification({
            userId: user.id,
            type: 'task.deleted',
            taskId: id,
            message: `Task deleted.`,
            name: task.title,
            subject: task.subject,
        });

        res.json({ ok: true });
    }),
);

// --- Notifications (history) ---
app.get(
    '/notifications',
    requireAuth(async (req, res, user) => {
        const fromId = typeof req.query.from === 'string' ? req.query.from : '$';
        const count = Number(req.query.count || 30);

        // XRANGE is simpler for a timeline; for incremental polling client can pass ?from=<lastId>
        const start = fromId === '$' ? '-' : `(${fromId}`;

        type StreamEntry = [string, string[]];
        const entries = (await redis.xrange(
            NOTIFICATIONS_STREAM,
            start,
            '+',
            'COUNT',
            String(count),
        )) as unknown as StreamEntry[];

        type RawNotif = {
            id: string;
            userId?: string;
            type?: string;
            taskId?: string;
            message?: string;
            name?: string;
            subject?: string;
            ts?: string;
        };

        const items = entries
            .map((e): RawNotif => {
                const [id, fields] = e;
                const obj: Record<string, string> = {};
                for (let i = 0; i < fields.length; i += 2) obj[fields[i]] = fields[i + 1];
                return { id, ...obj };
            })
            .filter((n) => {
                const uid = Number(n.userId ?? -1);
                return uid === 0 || uid === user.id;
            })
            .map((n) => ({
                id: n.id,
                type: n.type ?? 'unknown',
                taskId: n.taskId ?? '',
                message: n.message ?? '',
                name: n.name ?? '',
                subject: n.subject ?? '',
                ts: Number(n.ts ?? '0'),
            }));

        res.json(items);
    }),
);

const server = createServer(app);
attachSocketIo({ httpServer: server, jwtSecret: JWT_SECRET });

server.listen(PORT, () => {
    console.log(`API listening on http://localhost:${PORT}`);
});

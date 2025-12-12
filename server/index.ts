import express from 'express';
import cors from 'cors';
import { createHash, randomBytes } from 'node:crypto';
import { redis } from './redis.js';

type AuthUser = { id: number; username: string };
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
app.use(cors());
app.use(express.json());

const PORT = 5000;

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

function tokenKey(token: string) {
    return `token:${token}`; // stringified AuthUser
}

function hashPassword(password: string) {
    return createHash('sha256').update(password).digest('hex');
}

function randomToken() {
    // 32 bytes hex
    return randomBytes(32).toString('hex');
}

function publicUser(u: User): PublicUser {
    return { id: u.id, username: u.username };
}

async function getAuthUserFromReq(req: express.Request): Promise<AuthUser | null> {
    const header = req.header('authorization');
    if (!header) return null;
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
    const raw = await redis.get(tokenKey(token));
    if (!raw) return null;
    try {
        return JSON.parse(raw) as AuthUser;
    } catch {
        return null;
    }
}

function requireAuth(
    handler: (req: express.Request, res: express.Response, user: AuthUser) => Promise<void> | void,
) {
    return async (req: express.Request, res: express.Response) => {
        const user = await getAuthUserFromReq(req);
        if (!user) {
            res.status(401).json({ error: 'Unauthorized' } satisfies ApiError);
            return;
        }
        await handler(req, res, user);
    };
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
    const { username, password } = req.body ?? {};
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
    const user: User = {
        id,
        username: uname,
        passwordHash: hashPassword(password),
        createdAt: now(),
    };

    await redis
        .multi()
        .set(userKey(id), JSON.stringify(user))
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

    const userRaw = await redis.get(userKey(Number(userIdRaw)));
    if (!userRaw) {
        res.status(401).json({ error: 'invalid credentials' } satisfies ApiError);
        return;
    }

    const user = JSON.parse(userRaw) as User;
    const passHash = hashPassword(password);
    if (user.passwordHash !== passHash) {
        res.status(401).json({ error: 'invalid credentials' } satisfies ApiError);
        return;
    }

    const token = randomToken();
    const authUser: AuthUser = { id: user.id, username: user.username };
    // token TTL: 7 days
    await redis.set(tokenKey(token), JSON.stringify(authUser), 'EX', 60 * 60 * 24 * 7);

    res.json({ token, user: authUser });
});

app.post(
    '/auth/logout',
    requireAuth(async (req, res) => {
        const header = req.header('authorization') || '';
        const token = header.split(' ')[1];
        if (token) await redis.del(tokenKey(token));
        res.json({ ok: true });
    }),
);

// --- Tasks ---
app.get(
    '/tasks',
    requireAuth(async (_req, res, user) => {
        const ids = await redis.zrevrange(tasksByUserKey(user.id), 0, 200);
        if (!ids.length) {
            res.json([]);
            return;
        }
        const raws = await redis.mget(ids.map(taskKey));
        const tasks = raws.filter(Boolean).map((r: string | null) => JSON.parse(r as string) as Task);
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
            .set(taskKey(id), JSON.stringify(task))
            .zadd(tasksByUserKey(user.id), t, id)
            .exec();

        res.status(201).json(task);
    }),
);

app.put(
    '/tasks/:id',
    requireAuth(async (req, res, user) => {
        const id = req.params.id;
        const raw = await redis.get(taskKey(id));
        if (!raw) {
            res.status(404).json({ error: 'not found' } satisfies ApiError);
            return;
        }
        const current = JSON.parse(raw) as Task;
        if (current.userId !== user.id) {
            res.status(403).json({ error: 'forbidden' } satisfies ApiError);
            return;
        }

        const { title, subject, completed, finishDate } = req.body ?? {};
        if (typeof title !== 'string' || typeof subject !== 'string' || typeof completed !== 'boolean' || typeof finishDate !== 'number') {
            res.status(400).json({ error: 'title, subject, completed, finishDate are required' } satisfies ApiError);
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

        await redis.set(taskKey(id), JSON.stringify(updated));
        res.json(updated);
    }),
);

app.delete(
    '/tasks/:id',
    requireAuth(async (req, res, user) => {
        const id = req.params.id;
        const raw = await redis.get(taskKey(id));
        if (!raw) {
            res.status(404).json({ error: 'not found' } satisfies ApiError);
            return;
        }
        const task = JSON.parse(raw) as Task;
        if (task.userId !== user.id) {
            res.status(403).json({ error: 'forbidden' } satisfies ApiError);
            return;
        }

        await redis
            .multi()
            .del(taskKey(id))
            .zrem(tasksByUserKey(user.id), id)
            .exec();

        res.json({ ok: true });
    }),
);

app.listen(PORT, () => {
    console.log(`API listening on http://localhost:${PORT}`);
});

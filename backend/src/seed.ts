import { createHash } from 'node:crypto';
import { redis } from './redis.js';

const TASK_TTL_SECONDS = Number(process.env.TASK_TTL_SECONDS || 60 * 60 * 24 * 30);

type Role = 'student' | 'teacher';

type SeedUser = {
    username: string;
    password: string;
    role: Role;
};

type TaskSeed = {
    title: string;
    subject: string;
    finishDate: number;
};

function userKey(id: number) {
    return `user:${id}`;
}

function userByUsernameKey(username: string) {
    return `user:byUsername:${username.toLowerCase()}`;
}

function nextUserIdKey() {
    return 'seq:userId';
}

function taskKey(id: string) {
    return `task:${id}`;
}

function tasksByUserKey(userId: number) {
    return `tasks:user:${userId}`;
}

function tasksPublicKey() {
    return 'tasks:public';
}

function nextTaskIdKey() {
    return 'seq:taskId';
}

function hashPassword(password: string) {
    return createHash('sha256').update(password).digest('hex');
}

async function upsertUser(seed: SeedUser): Promise<{ id: number; username: string; role: Role }> {
    const existingIdRaw = await redis.get(userByUsernameKey(seed.username));
    let id: number;

    if (existingIdRaw) {
        id = Number(existingIdRaw);
    } else {
        id = Number(await redis.incr(nextUserIdKey()));
    }

    const userDoc = {
        id,
        username: seed.username,
        passwordHash: hashPassword(seed.password),
        role: seed.role,
        createdAt: Date.now(),
    };

    await redis
        .multi()
        .call('JSON.SET', userKey(id), '$', JSON.stringify(userDoc))
        .set(userByUsernameKey(seed.username), String(id))
        .exec();

    return { id, username: seed.username, role: seed.role };
}

async function createPublicTask(ownerUserId: number, t: TaskSeed) {
    const id = String(await redis.incr(nextTaskIdKey()));
    const now = Date.now();

    const taskDoc = {
        id,
        userId: ownerUserId,
        title: t.title,
        subject: t.subject,
        completed: false,
        finishDate: t.finishDate,
        createdAt: now,
        updatedAt: now,
    };

    await redis
        .multi()
        .call('JSON.SET', taskKey(id), '$', JSON.stringify(taskDoc))
        .expire(taskKey(id), TASK_TTL_SECONDS)
        .zadd(tasksByUserKey(ownerUserId), now, id)
        .zadd(tasksPublicKey(), now, id)
        .exec();
}

function futureDate(daysFromNow: number) {
    return Date.now() + daysFromNow * 24 * 60 * 60 * 1000;
}

async function main() {
    const teacher = await upsertUser({ username: 'teacher', password: '1234', role: 'teacher' });
    await upsertUser({ username: 'student', password: '1234', role: 'student' });

    const tasks: TaskSeed[] = [
        { title: 'Read Chapter 1', subject: 'English', finishDate: futureDate(3) },
        { title: 'Math worksheet', subject: 'Math', finishDate: futureDate(2) },
        { title: 'Lab report draft', subject: 'Biology', finishDate: futureDate(5) },
        { title: 'History notes', subject: 'History', finishDate: futureDate(4) },
        { title: 'Programming exercise', subject: 'Computer Science', finishDate: futureDate(7) },
        { title: 'Chemistry quiz prep', subject: 'Chemistry', finishDate: futureDate(6) },
        { title: 'Geometry review', subject: 'Math', finishDate: futureDate(1) },
        { title: 'Essay outline', subject: 'English', finishDate: futureDate(8) },
        { title: 'Map assignment', subject: 'Geography', finishDate: futureDate(9) },
        { title: 'Physics problems', subject: 'Physics', finishDate: futureDate(10) },
    ];

    // Create 10 NEW public tasks each run.
    // (If you want idempotent tasks, we can add a redis key marker and skip when already seeded.)
    for (const t of tasks) {
        await createPublicTask(teacher.id, t);
    }

    // eslint-disable-next-line no-console
    console.log('Seed complete');
    // eslint-disable-next-line no-console
    console.log('Users:');
    // eslint-disable-next-line no-console
    console.log(`- teacher / 1234 (role: teacher)`);
    // eslint-disable-next-line no-console
    console.log(`- student / 1234 (role: student)`);
    // eslint-disable-next-line no-console
    console.log('Tasks: 10 public tasks created');

    // Close redis connection so process exits
    try {
        redis.disconnect();
    } catch {
        // ignore
    }
}

main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Seed failed', err);
    try {
        redis.disconnect();
    } catch {
        // ignore
    }
    process.exitCode = 1;
});

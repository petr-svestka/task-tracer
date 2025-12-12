import { redis } from './redis.js';

export type Task = {
    id: string;
    userId: number;
    title: string;
    subject: string;
    completed: boolean;
    finishDate: number;
    createdAt: number;
    updatedAt: number;
};

export function taskKey(id: string) {
    return `task:${id}`;
}

export function tasksByUserKey(userId: number) {
    return `tasks:user:${userId}`; // sorted-set, member=id, score=createdAt
}

export async function getTask(id: string): Promise<Task | null> {
    const json = (await redis.call('JSON.GET', taskKey(id))) as string | null;
    if (!json) return null;
    return JSON.parse(json) as Task;
}

export async function setTask(task: Task, ttlSeconds: number) {
    await redis.call('JSON.SET', taskKey(task.id), '$', JSON.stringify(task));
    await redis.expire(taskKey(task.id), ttlSeconds);
}

export async function deleteTask(id: string) {
    await redis.del(taskKey(id));
}

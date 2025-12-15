import { redis } from './redis.js';

export type TaskEventType = 'task.created' | 'task.updated' | 'task.deleted';

export async function appendTaskEvent(evt: {
    type: TaskEventType;
    userId: number;
    taskId: string;
}) {
    // Redis Streams history
    // key: task:history
    await redis.xadd(
        'task:history',
        '*',
        'type',
        evt.type,
        'userId',
        String(evt.userId),
        'taskId',
        evt.taskId,
        'ts',
        String(Date.now()),
    );
}

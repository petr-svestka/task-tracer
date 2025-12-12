import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { redis } from './redis.js';
import { verifyJwt } from './jwt.js';

type AuthUser = { id: number; username: string };

type TaskEvent = { type: 'task.created' | 'task.updated' | 'task.deleted'; userId: number; taskId: string };

export async function attachSocketIo(opts: {
    httpServer: HttpServer;
    jwtSecret: string;
}) {
    const io = new Server(opts.httpServer, {
        cors: { origin: true, credentials: true },
    });

    // Socket.IO Redis adapter (separate connections recommended)
    const pubClient = new Redis({ host: process.env.REDIS_HOST || '127.0.0.1', port: Number(process.env.REDIS_PORT || 6379) });
    const subClient = pubClient.duplicate();
    await Promise.all([pubClient.connect(), subClient.connect()].map(p => p.catch(() => undefined)));
    io.adapter(createAdapter(pubClient, subClient));

    io.use((socket: Socket, next: (err?: Error) => void) => {
        const token = socket.handshake.auth?.token as string | undefined;
        if (!token) return next(new Error('Unauthorized'));

        const v = verifyJwt(token, opts.jwtSecret);
        if (!v.valid || !v.payload) return next(new Error('Unauthorized'));

        const { sub, username } = v.payload as { sub?: unknown; username?: unknown };
        if (typeof sub !== 'number' || typeof username !== 'string') return next(new Error('Unauthorized'));

        (socket.data as { user?: AuthUser }).user = { id: sub, username };
        next();
    });

    io.on('connection', (socket: Socket) => {
        const user = (socket.data as { user?: AuthUser }).user;
        if (user) socket.join(`user:${user.id}`);
    });

    // Bridge Redis Pub/Sub -> Socket.IO rooms
    const sub = redis.duplicate();
    sub.subscribe('task-events');
    sub.on('message', (_channel, message) => {
        try {
            const evt = JSON.parse(message) as TaskEvent;
            io.to(`user:${evt.userId}`).emit('task:event', evt);
        } catch {
            // ignore
        }
    });
}

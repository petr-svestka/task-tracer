import { redis } from './redis.js';

export type StoredUser = {
    id: number;
    username: string;
    passwordHash: string;
    createdAt: number;
};

export function userDocKey(id: number) {
    return `user:${id}`;
}

export function userByUsernameKey(username: string) {
    return `user:byUsername:${username.toLowerCase()}`;
}

export async function getUserById(id: number): Promise<StoredUser | null> {
    // Redis Stack JSON doc
    const doc = await redis.call('JSON.GET', userDocKey(id)) as string | null;
    if (!doc) return null;
    return JSON.parse(doc) as StoredUser;
}

export async function getUserByUsername(username: string): Promise<StoredUser | null> {
    const idRaw = await redis.get(userByUsernameKey(username));
    if (!idRaw) return null;
    return getUserById(Number(idRaw));
}

export async function createUser(user: StoredUser) {
    await redis
        .multi()
        .call('JSON.SET', userDocKey(user.id), '$', JSON.stringify(user))
        .set(userByUsernameKey(user.username), String(user.id))
        .exec();
}

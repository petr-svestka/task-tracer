import { createHmac } from 'node:crypto';

type JwtPayload = Record<string, unknown>;

type JwtHeader = {
    alg: 'HS256';
    typ: 'JWT';
};

function b64urlEncode(buf: Buffer) {
    return buf
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function b64urlEncodeJson(obj: unknown) {
    return b64urlEncode(Buffer.from(JSON.stringify(obj)));
}

function b64urlDecodeToString(s: string) {
    const padded = s.replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (padded.length % 4)) % 4;
    const base64 = padded + '='.repeat(padLen);
    return Buffer.from(base64, 'base64').toString('utf8');
}

export function signJwt(payload: JwtPayload, secret: string, expiresInSeconds: number) {
    const header: JwtHeader = { alg: 'HS256', typ: 'JWT' };
    const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const fullPayload = { ...payload, exp };

    const h = b64urlEncodeJson(header);
    const p = b64urlEncodeJson(fullPayload);
    const data = `${h}.${p}`;

    const sig = createHmac('sha256', secret).update(data).digest();
    const s = b64urlEncode(sig);
    return `${data}.${s}`;
}

export function verifyJwt(token: string, secret: string): { valid: boolean; payload?: JwtPayload } {
    const parts = token.split('.');
    if (parts.length !== 3) return { valid: false };
    const [h, p, s] = parts;

    const data = `${h}.${p}`;
    const expected = b64urlEncode(createHmac('sha256', secret).update(data).digest());
    if (expected !== s) return { valid: false };

    try {
        const payload = JSON.parse(b64urlDecodeToString(p)) as JwtPayload;
        const exp = payload.exp;
        if (typeof exp === 'number' && exp < Math.floor(Date.now() / 1000)) return { valid: false };
        return { valid: true, payload };
    } catch {
        return { valid: false };
    }
}

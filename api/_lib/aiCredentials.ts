import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { AI_PROVIDER_IDS, type AiProviderId } from '../../src/ai/modelTypes.js';

const COOKIE_NAME = 'noacg_ai_keys';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

type StoredKeys = Partial<Record<AiProviderId, string>>;

function encryptionKey(): Buffer | null {
  const secret = (process.env.AI_KEY_ENCRYPTION_SECRET ?? '').trim();
  if (secret.length < 32) return null;
  return createHash('sha256').update(secret).digest();
}

function cookieValue(req: Request): string {
  const header = req.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === COOKIE_NAME) return value.join('=');
  }
  return '';
}

function validKeys(value: unknown): StoredKeys {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const keys: StoredKeys = {};
  for (const provider of AI_PROVIDER_IDS) {
    const key = source[provider];
    if (typeof key === 'string' && key.length >= 8 && key.length <= 512) keys[provider] = key;
  }
  return keys;
}

export function canStoreUserAiKeys(): boolean {
  return encryptionKey() !== null;
}

/** Decrypt user keys from the HttpOnly cookie. Invalid/tampered state fails closed. */
export function readUserAiKeys(req: Request): StoredKeys {
  const key = encryptionKey();
  const sealed = cookieValue(req);
  if (!key || !sealed) return {};
  try {
    const packed = Buffer.from(sealed, 'base64url');
    if (packed.length < 12 + 16 + 2) return {};
    const iv = packed.subarray(0, 12);
    const tag = packed.subarray(12, 28);
    const ciphertext = packed.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    return validKeys(JSON.parse(plaintext));
  } catch {
    return {};
  }
}

function secureRequest(req: Request): boolean {
  return req.url.startsWith('https:') || req.headers.get('x-forwarded-proto') === 'https';
}

/** Seal all user keys into one authenticated, browser-unreadable cookie. */
export function userAiKeysCookie(req: Request, keys: StoredKeys): string {
  const key = encryptionKey();
  if (!key) throw new Error('AI user-key storage is not configured');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(keys), 'utf8'), cipher.final()]);
  const packed = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
  const secure = secureRequest(req) ? '; Secure' : '';
  return `${COOKIE_NAME}=${packed}; Path=/api/ai; HttpOnly; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE}${secure}`;
}

export function clearUserAiKeysCookie(req: Request): string {
  const secure = secureRequest(req) ? '; Secure' : '';
  return `${COOKIE_NAME}=; Path=/api/ai; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

/**
 * The MANAGED credential for a provider - server environment only.
 *
 * `vercel` is the one with two sources, and the order is deliberate. A deployment on Vercel
 * is issued a short-lived `VERCEL_OIDC_TOKEN` automatically and rotates it without anyone
 * touching a secret, so OIDC is the intended production credential and the one to prefer
 * where both exist. `AI_GATEWAY_API_KEY` is the static fallback: what a self-host, a CI job
 * or a local `npm run dev` without `vercel env pull` can supply. An explicit key WINS over
 * an ambient token, matching the gateway's own precedence, so naming a key is never
 * silently ignored on a Vercel box.
 */
export function managedAiKey(provider: AiProviderId): string {
  const names: Record<AiProviderId, string> = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    google: 'GOOGLE_API_KEY',
    vercel: 'AI_GATEWAY_API_KEY',
    huggingface: 'HUGGINGFACE_API_KEY',
  };
  const conventionalFallback = provider === 'huggingface'
    ? process.env.HF_TOKEN
    : provider === 'vercel'
      ? process.env.VERCEL_OIDC_TOKEN
      // Google's own SDKs and the Gemini docs both use GEMINI_API_KEY, so a machine set up
      // for Gemini already carries it under that name.
      : provider === 'google'
        ? process.env.GEMINI_API_KEY
        : '';
  return (process.env[names[provider]] || conventionalFallback || '').trim();
}

export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  try {
    const expected = new URL(req.url);
    const forwardedHost = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
    const forwardedProto = req.headers.get('x-forwarded-proto');
    if (forwardedHost) expected.host = forwardedHost;
    if (forwardedProto === 'http:' || forwardedProto === 'https:') expected.protocol = forwardedProto;
    else if (forwardedProto === 'http' || forwardedProto === 'https') expected.protocol = `${forwardedProto}:`;
    return new URL(origin).origin === expected.origin;
  } catch {
    return false;
  }
}

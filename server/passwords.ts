/**
 * Password hashing with the platform Web Crypto API (PBKDF2-HMAC-SHA-256, random 16-byte salt per password).
 *
 * Cloudflare Workers caps PBKDF2 at 100,000 iterations, so that is the work factor used. The algorithm and iteration
 * count are stored with every hash, so a stronger setting can be introduced later and older hashes are upgraded at
 * the next successful sign-in (`needsRehash`). Plain passwords are never stored or logged.
 */
const ITERATIONS = 100_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;
const PREFIX = "pbkdf2-sha256";

const encoder = new TextEncoder();
const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password.normalize("NFKC")), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, KEY_BITS);
  return new Uint8Array(bits);
}

/** Constant-time comparison of two byte arrays. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  return `${PREFIX}$${ITERATIONS}$${toB64(salt)}$${toB64(await derive(password, salt, ITERATIONS))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [prefix, rounds, salt, hash] = stored.split("$");
  const iterations = Number(rounds);
  if (prefix !== PREFIX || !Number.isInteger(iterations) || iterations < 10_000 || iterations > ITERATIONS || !salt || !hash) return false;
  try { return timingSafeEqual(await derive(password, fromB64(salt), iterations), fromB64(hash)); } catch { return false; }
}

export const needsRehash = (stored: string) => stored.split("$")[1] !== String(ITERATIONS) || !stored.startsWith(PREFIX + "$");

/** Used when the username is unknown, so a failed sign-in takes the same time whether or not the account exists. */
let dummy: Promise<string> | undefined;
export async function burnPasswordCheck(password: string) { dummy ??= hashPassword("vaps-unknown-account"); await verifyPassword(password, await dummy); }

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

/** Returns an error message, or "" when the new password is acceptable. */
export function passwordProblem(password: unknown, username: string): string {
  if (typeof password !== "string") return "Enter a new password.";
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  if (password.trim() !== password) return "The password cannot start or end with a space.";
  if (new Set(password).size < 5) return "Use a less repetitive password.";
  if (username && password.toLowerCase().includes(username.toLowerCase())) return "The password cannot contain your username.";
  return "";
}

/** Random temporary password issued by an administrator (shown once, must be changed at first sign-in). */
export function temporaryPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const limit = 256 - (256 % alphabet.length); // rejection sampling: no modulo bias
  const chars: string[] = [];
  while (chars.length < 16) for (const b of crypto.getRandomValues(new Uint8Array(32))) if (b < limit && chars.length < 16) chars.push(alphabet[b % alphabet.length]);
  return [chars.slice(0, 4), chars.slice(4, 8), chars.slice(8, 12), chars.slice(12, 16)].map((g) => g.join("")).join("-");
}

/** 32 random bytes as hex, and its SHA-256 hash (only the hash is stored). */
export function randomToken(): string { return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join(""); }
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

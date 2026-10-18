import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

function key(): Buffer {
  const k = process.env.ENCRYPTION_KEY;
  if (k) {
    const b = Buffer.from(k, "base64");
    if (b.length === 32) return b;
  }
  return createHash("sha256").update(process.env.JWT_SECRET || "dev-insecure-secret").digest();
}

/** AES-256-GCM. Output: iv.tag.ciphertext (base64 parts). */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}

export function decrypt(payload: string): string {
  const [iv, tag, enc] = payload.split(".").map((x) => Buffer.from(x, "base64"));
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

/** Show only the start and the last 4 characters of a secret. */
export function mask(v?: string | null): string {
  if (!v) return "";
  if (v.length <= 8) return "••••";
  const head = v.slice(0, Math.min(6, Math.floor(v.length / 5)));
  return `${head}…${v.slice(-4)}`;
}

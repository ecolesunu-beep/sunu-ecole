import "server-only";
import { createCipheriv, createDecipheriv, createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";

function key(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Configuration requise : ${name}.`);
  const buffer = Buffer.from(value, "base64");
  if (buffer.length !== 32) throw new Error(`${name} doit contenir 32 octets aléatoires encodés en base64.`);
  return buffer;
}
const fingerprint = (value: Buffer) => createHash("sha256").update(value).digest().subarray(0, 16);
const magic = Buffer.from("SEB2");
export class UnavailableEnvelope extends Error {
  constructor() { super("Cette donnée a été chiffrée avec une ancienne clé. Restaurez la clé d’origine pour la lire ; sa valeur enregistrée est conservée."); }
}
export const randomToken = () => randomBytes(32).toString("base64url");
export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const indexWith = (value: string, material: Buffer) => createHmac("sha256", material).update(value.toLocaleLowerCase("fr").trim()).digest("hex");
export const lookup = (value: string) => indexWith(value, key("LOOKUP_KEY"));
export function lookupCandidates(value: string) {
  return [...new Set([lookup(value), ...(process.env.PREVIOUS_LOOKUP_KEY ? [indexWith(value, key("PREVIOUS_LOOKUP_KEY"))] : [])])];
}
export function encryptBytes(buffer: Buffer) {
  const material = key("DATA_ENCRYPTION_KEY"), iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", material, iv);
  const body = Buffer.concat([cipher.update(buffer), cipher.final()]);
  // Versioned envelopes identify the key used; older payloads remain untouched.
  return Buffer.concat([magic, fingerprint(material), iv, cipher.getAuthTag(), body]);
}
export function decryptBytes(buffer: Buffer) {
  const tagged = buffer.subarray(0, 4).equals(magic);
  const payload = tagged ? buffer.subarray(20) : buffer;
  if (payload.length < 29) throw new UnavailableEnvelope();
  const materials = [key("DATA_ENCRYPTION_KEY"), ...(process.env.PREVIOUS_DATA_ENCRYPTION_KEY ? [key("PREVIOUS_DATA_ENCRYPTION_KEY")] : [])];
  for (const material of materials) {
    if (tagged && !fingerprint(material).equals(buffer.subarray(4, 20))) continue;
    try {
      const decipher = createDecipheriv("aes-256-gcm", material, payload.subarray(0, 12));
      decipher.setAuthTag(payload.subarray(12, 28));
      return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]);
    } catch { /* An incompatible key never produces plaintext. */ }
  }
  throw new UnavailableEnvelope();
}
export function encrypt(value: string | null | undefined): string | null {
  return value ? `v2:${encryptBytes(Buffer.from(value, "utf8")).toString("base64")}` : null;
}
export function decrypt(value: string | null | undefined): string {
  if (!value) return "";
  if (!/^v[12]:/.test(value)) throw new UnavailableEnvelope();
  return decryptBytes(Buffer.from(value.slice(3), "base64")).toString("utf8");
}
export function attachmentSignature(id: string, schoolId: string, expiry: number) {
  return createHmac("sha256", key("LOOKUP_KEY")).update(`${id}:${schoolId}:${expiry}`).digest("hex");
}
export function verifyAttachmentSignature(id: string, schoolId: string, expiry: number, signature: string) {
  if (!Number.isSafeInteger(expiry) || expiry < Math.floor(Date.now() / 1000) || expiry > Math.floor(Date.now() / 1000) + 3601 || !/^[a-f0-9]{64}$/.test(signature)) return false;
  return timingSafeEqual(Buffer.from(attachmentSignature(id, schoolId, expiry), "hex"), Buffer.from(signature, "hex"));
}
export function getIp(request: Request) {
  return (request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown").trim().slice(0, 64);
}
export function originAllowed(request: Request) {
  const source = request.headers.get("origin"), site = request.headers.get("sec-fetch-site");
  if (site === "cross-site") return false;
  if (!source) return true;
  try {
    const origin = new URL(source);
    if (!['https:', 'http:'].includes(origin.protocol) || origin.origin !== source || origin.username || origin.password) return false;
    const managed = !!process.env.E2B_SANDBOX_ID && process.env.SUNU_ENV !== 'production';
    const configured = process.env.NEXT_PUBLIC_APP_URL;
    if (configured && !managed) return origin.origin === new URL(configured).origin;
    const trustedProxy = managed || process.env.SUNU_TRUST_PROXY === '1';
    const forwarded = trustedProxy ? request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() : null;
    const publicHost = forwarded || request.headers.get('host') || new URL(request.url).host;
    if (origin.host.toLowerCase() === publicHost.toLowerCase()) return true;
    return managed && site === 'same-origin';
  } catch { return false; }
}
export function schoolCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return "SUNU-" + Array.from(randomBytes(8), (byte) => alphabet[byte % alphabet.length]).join("");
}

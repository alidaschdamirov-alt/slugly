import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { ENV } from "./_core/env";

const STORAGE_ROOT = path.resolve(ENV.storageDir);
const SIGNED_URL_TTL_SECONDS = 15 * 60;

function normalizeKey(relKey: string): string {
  const normalized = path.posix.normalize(
    relKey.replaceAll("\\", "/").replace(/^\/+/, "")
  );
  if (
    !normalized ||
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized.includes("/../")
  ) {
    throw new Error("Invalid storage key");
  }
  return normalized;
}

function appendHashSuffix(relKey: string): string {
  const hash = randomUUID().replaceAll("-", "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

function publicUrl(key: string): string {
  return `/storage/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export function isPrivateStorageKey(key: string): boolean {
  return key.startsWith("backups/") || key.startsWith("reports/");
}

function signingSecret(): string {
  const secret =
    process.env.STORAGE_SIGNING_SECRET || process.env.CLERK_SECRET_KEY;
  if (!secret)
    throw new Error("STORAGE_SIGNING_SECRET or CLERK_SECRET_KEY is required");
  return secret;
}

async function persist(key: string, data: Buffer | Uint8Array | string) {
  const destination = resolveStoragePath(key);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(
    destination,
    typeof data === "string" ? Buffer.from(data) : Buffer.from(data)
  );
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  _contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));
  await persist(key, data);
  return {
    key,
    url: isPrivateStorageKey(key)
      ? await storageGetSignedUrl(key)
      : publicUrl(key),
  };
}

export async function storagePutExact(
  relKey: string,
  data: Buffer | Uint8Array | string,
  _contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  await persist(key, data);
  return {
    key,
    url: isPrivateStorageKey(key)
      ? await storageGetSignedUrl(key)
      : publicUrl(key),
  };
}

export async function storageGet(
  relKey: string
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return {
    key,
    url: isPrivateStorageKey(key)
      ? await storageGetSignedUrl(key)
      : publicUrl(key),
  };
}

export async function storageRead(relKey: string): Promise<Buffer> {
  return readFile(resolveStoragePath(relKey));
}

export async function storageStat(relKey: string): Promise<{ size: number; mtimeMs: number }> {
  const info = await stat(resolveStoragePath(relKey));
  return { size: info.size, mtimeMs: info.mtimeMs };
}

export async function storageDelete(relKey: string): Promise<boolean> {
  try {
    await unlink(resolveStoragePath(relKey));
    return true;
  } catch (error: any) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const key = normalizeKey(relKey);
  const expires = Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SECONDS;
  const signature = createStorageSignature(key, expires);
  return `/storage-private/${key.split("/").map(encodeURIComponent).join("/")}?expires=${expires}&signature=${signature}`;
}

export function resolveStoragePath(relKey: string): string {
  const key = normalizeKey(relKey);
  const resolved = path.resolve(STORAGE_ROOT, key);
  if (
    resolved !== STORAGE_ROOT &&
    !resolved.startsWith(`${STORAGE_ROOT}${path.sep}`)
  ) {
    throw new Error("Invalid storage path");
  }
  return resolved;
}

export function createStorageSignature(key: string, expires: number): string {
  return createHmac("sha256", signingSecret())
    .update(`${normalizeKey(key)}:${expires}`)
    .digest("hex");
}

export function verifyStorageSignature(
  key: string,
  expires: number,
  signature: string
): boolean {
  if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000))
    return false;
  const expected = Buffer.from(createStorageSignature(key, expires));
  const supplied = Buffer.from(signature || "");
  if (expected.length !== supplied.length) return false;
  return timingSafeEqual(expected, supplied);
}

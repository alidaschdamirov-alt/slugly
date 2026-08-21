import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  settings: new Map<string, string>(),
  storage: new Map<string, Buffer>(),
  storageDelete: vi.fn(),
  writeAuditLog: vi.fn(),
}));

vi.mock("./db", () => ({
  getDb: vi.fn(async () => null),
  getSiteSetting: vi.fn(async (key: string) => mocks.settings.get(key) ?? null),
  setSiteSetting: vi.fn(async (key: string, value: string) => { mocks.settings.set(key, value); }),
  writeAuditLog: mocks.writeAuditLog,
}));

vi.mock("./storage", () => ({
  storageDelete: mocks.storageDelete,
  storageGetSignedUrl: vi.fn(async (key: string) => `/private/${key}`),
  storagePutExact: vi.fn(async (key: string, value: Buffer | string) => {
    mocks.storage.set(key, Buffer.isBuffer(value) ? Buffer.from(value) : Buffer.from(value));
    return { key, url: `/private/${key}` };
  }),
  storageRead: vi.fn(async (key: string) => {
    const value = mocks.storage.get(key);
    if (!value) throw new Error("missing storage object");
    return Buffer.from(value);
  }),
  storageStat: vi.fn(async (key: string) => ({ size: mocks.storage.get(key)?.length || 0, mtimeMs: Date.now() })),
}));

import {
  normalizeBackupConfig,
  validateRestorePayload,
  verifyBackup,
  type BackupManifest,
} from "./backup";

function checksum(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function createEnvelope(payload: unknown, secret: string) {
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const key = createHash("sha256").update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    raw: Buffer.from(JSON.stringify({
      format: "slugly-backup-encrypted-v2",
      algorithm: "aes-256-gcm",
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64"),
      checksumSha256: checksum(plaintext),
      ciphertext: ciphertext.toString("base64"),
    }), "utf8"),
    checksumSha256: checksum(plaintext),
    plaintextBytes: plaintext.length,
  };
}

function validPayload() {
  return {
    exportedAt: "2026-08-21T06:00:00.000Z",
    version: "2.0",
    summary: {
      users: 1,
      workspaces: 1,
      projects: 1,
      links: 1,
      clicks: 1,
      domains: 0,
      auditLog: 0,
    },
    data: {
      users: [{ id: 1, email: "owner@example.com" }],
      workspaces: [{ id: 10, name: "Acme" }],
      projects: [{ id: 20, userId: 1, workspaceId: 10 }],
      links: [{ id: 30, userId: 1, projectId: 20, shortCode: "abc123" }],
      clicks: [{ id: 40, linkId: 30 }],
      domains: [],
      auditLog: [],
    },
  };
}

function manifestFor(key: string, checksumSha256: string): BackupManifest {
  return {
    id: "testbackup001",
    key,
    createdAt: "2026-08-21T06:00:00.000Z",
    source: "manual",
    version: "2.0",
    encrypted: true,
    encryption: "aes-256-gcm",
    encryptionKeySource: "dedicated",
    checksumSha256,
    sizeBytes: 0,
    plaintextBytes: 0,
    summary: validPayload().summary,
    integrityStatus: "pending",
    lastVerifiedAt: null,
    lastRestoreTestAt: null,
    restoreTestStatus: null,
    restoreTestDetail: null,
  };
}

describe("backup v2", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.settings.clear();
    mocks.storage.clear();
    process.env.BACKUP_ENCRYPTION_KEY = "unit-test-dedicated-backup-key-that-stays-stable";
  });

  it("normalizes schedule and retention bounds", () => {
    expect(normalizeBackupConfig({
      enabled: true,
      hourUtc: 99,
      minuteUtc: -10,
      retentionCount: 0,
      retentionDays: 9000,
    })).toEqual({
      enabled: true,
      hourUtc: 23,
      minuteUtc: 0,
      retentionCount: 30,
      retentionDays: 3650,
    });
  });

  it("accepts a structurally consistent restore payload", () => {
    const result = validateRestorePayload(validPayload() as any);
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.rowCount).toBe(5);
  });

  it("detects broken references before a restore can be approved", () => {
    const payload = validPayload();
    payload.data.links[0].projectId = 999;
    const result = validateRestorePayload(payload as any);
    expect(result.ok).toBe(false);
    expect(result.warnings.some(message => message.includes("missing project 999"))).toBe(true);
  });

  it("verifies an AES-256-GCM archive and SHA-256 manifest", async () => {
    const key = "backups/v2/test.json.enc";
    const encrypted = createEnvelope(validPayload(), process.env.BACKUP_ENCRYPTION_KEY!);
    const manifest = manifestFor(key, encrypted.checksumSha256);
    manifest.plaintextBytes = encrypted.plaintextBytes;
    mocks.storage.set(key, encrypted.raw);
    mocks.settings.set("backup_history_v2", JSON.stringify([manifest]));

    const result = await verifyBackup(manifest.id);
    expect(result.ok).toBe(true);
    expect(result.checksumSha256).toBe(encrypted.checksumSha256);
    const history = JSON.parse(mocks.settings.get("backup_history_v2") || "[]");
    expect(history[0].integrityStatus).toBe("verified");
    expect(history[0].lastVerifiedAt).toBeTruthy();
  });

  it("rejects a tampered encrypted archive", async () => {
    const key = "backups/v2/tampered.json.enc";
    const encrypted = createEnvelope(validPayload(), process.env.BACKUP_ENCRYPTION_KEY!);
    const envelope = JSON.parse(encrypted.raw.toString("utf8"));
    const ciphertext = Buffer.from(envelope.ciphertext, "base64");
    ciphertext[0] = ciphertext[0] ^ 0xff;
    envelope.ciphertext = ciphertext.toString("base64");
    const manifest = manifestFor(key, encrypted.checksumSha256);
    mocks.storage.set(key, Buffer.from(JSON.stringify(envelope), "utf8"));
    mocks.settings.set("backup_history_v2", JSON.stringify([manifest]));

    await expect(verifyBackup(manifest.id)).rejects.toThrow();
    const history = JSON.parse(mocks.settings.get("backup_history_v2") || "[]");
    expect(history[0].integrityStatus).toBe("failed");
  });
});

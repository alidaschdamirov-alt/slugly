import type { Request } from "express";
import { getSiteSetting, setSiteSetting } from "./db";
import { consumeCleanupPreview, createCleanupPreview, type CleanupPreview } from "./softDelete";

const ACTIVE_PREVIEW_KEY = "cleanup_expired_active_preview_v1";
const PREVIEW_KEY_PREFIX = "cleanup_expired_preview_v1_";

export async function createCleanupPreviewGate(actorId: number, req: Request): Promise<CleanupPreview> {
  const preview = await createCleanupPreview(actorId, req);
  await setSiteSetting(ACTIVE_PREVIEW_KEY, preview.token);
  return preview;
}

export async function consumeCleanupPreviewGate(): Promise<CleanupPreview> {
  const token = await getSiteSetting(ACTIVE_PREVIEW_KEY);
  if (!token || token === "null") {
    throw new Error("Preview required: review the expired links before running Cleanup Expired.");
  }
  const raw = await getSiteSetting(`${PREVIEW_KEY_PREFIX}${token}`);
  if (!raw || raw === "null") {
    await setSiteSetting(ACTIVE_PREVIEW_KEY, "null");
    throw new Error("Cleanup preview is missing or already used. Refresh the preview.");
  }
  let actorId = 0;
  try {
    actorId = Number((JSON.parse(raw) as CleanupPreview).actorId);
  } catch {
    actorId = 0;
  }
  if (!Number.isInteger(actorId) || actorId <= 0) {
    await setSiteSetting(ACTIVE_PREVIEW_KEY, "null");
    throw new Error("Cleanup preview is invalid. Refresh the preview.");
  }
  try {
    return await consumeCleanupPreview(token, actorId);
  } finally {
    await setSiteSetting(ACTIVE_PREVIEW_KEY, "null");
  }
}

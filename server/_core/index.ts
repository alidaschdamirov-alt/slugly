import express from "express";

// Capture the exact webhook payload only for Svix-signed requests. Resend/Svix
// signature verification must use the raw request body rather than a re-serialized JSON object.
const originalJson = express.json;
(express as any).json = (options: any = {}) => {
  const previousVerify = options.verify;
  return originalJson({
    ...options,
    verify(req: any, res: any, buf: Buffer, encoding: string) {
      if (req.headers?.["svix-signature"]) {
        req.rawBody = Buffer.from(buf).toString("utf8");
      }
      if (typeof previousVerify === "function") previousVerify(req, res, buf, encoding);
    },
  });
};

// Keep /healthz public and lightweight, but include the immutable deploy SHA so
// release automation can prove that Render is serving the exact main commit.
const originalResponseJson = express.response.json;
(express.response as any).json = function healthAwareJson(body: unknown) {
  const requestPath = (this as any)?.req?.path;
  const nextBody = requestPath === "/healthz" && body && typeof body === "object" && !Array.isArray(body)
    ? {
        ...(body as Record<string, unknown>),
        commit: process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || null,
        runtime: process.version,
      }
    : body;
  return originalResponseJson.call(this, nextBody as any);
};

async function bootstrap() {
  await import("./indexCore");
  const { startBackupSchedulerWithTelemetry } = await import("../backupScheduler");
  startBackupSchedulerWithTelemetry();
}

void bootstrap().catch(error => {
  console.error("[Bootstrap] Failed to start Slugly:", error);
  process.exitCode = 1;
});

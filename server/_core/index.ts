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

await import("./indexCore");
const { startBackupScheduler } = await import("../backup");
startBackupScheduler();

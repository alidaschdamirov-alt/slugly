import type { Express } from "express";
import {
  isPrivateStorageKey,
  resolveStoragePath,
  verifyStorageSignature,
} from "../storage";

function routeKey(params: Record<string, string>): string | undefined {
  return params[0];
}

export function registerStorageRoutes(app: Express) {
  app.get("/storage/*", (req, res) => {
    const key = routeKey(req.params as Record<string, string>);
    if (!key || isPrivateStorageKey(key)) {
      res.status(404).send("Not found");
      return;
    }

    try {
      res.set("Cache-Control", "public, max-age=3600");
      res.sendFile(resolveStoragePath(key), error => {
        if (error && !res.headersSent)
          res.status(getErrorStatus(error)).send("Not found");
      });
    } catch {
      res.status(400).send("Invalid storage key");
    }
  });

  app.get("/storage-private/*", (req, res) => {
    const key = routeKey(req.params as Record<string, string>);
    const expires = Number(req.query.expires);
    const signature =
      typeof req.query.signature === "string" ? req.query.signature : "";
    if (!key || !verifyStorageSignature(key, expires, signature)) {
      res.status(403).send("Invalid or expired link");
      return;
    }

    try {
      res.set("Cache-Control", "private, no-store");
      res.sendFile(resolveStoragePath(key), error => {
        if (error && !res.headersSent)
          res.status(getErrorStatus(error)).send("Not found");
      });
    } catch {
      res.status(400).send("Invalid storage key");
    }
  });
}

function getErrorStatus(error: Error): number {
  const status = (error as Error & { statusCode?: number }).statusCode;
  return typeof status === "number" ? status : 404;
}

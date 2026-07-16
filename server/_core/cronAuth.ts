import { timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { ENV } from "./env";

export function isAuthorizedCronRequest(req: Request): boolean {
  if (!ENV.cronSecret) return false;
  const header = req.header("authorization") ?? "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!supplied) return false;

  const expectedBuffer = Buffer.from(ENV.cronSecret);
  const suppliedBuffer = Buffer.from(supplied);
  if (expectedBuffer.length !== suppliedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, suppliedBuffer);
}

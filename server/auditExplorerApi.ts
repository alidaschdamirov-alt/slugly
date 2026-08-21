import { Router, type Request, type Response } from "express";
import { and, count, desc, eq, gte, like, lte } from "drizzle-orm";
import { auditLog } from "../drizzle/schema";
import { getDb } from "./db";
import { isPrivilegedIpAllowed } from "./privilegedIp";
import { sdk } from "./_core/sdk";

export const auditExplorerRouter = Router();

async function requireAdmin(req: Request, res: Response) {
  const actor = await sdk.authenticateRequest(req);
  if (actor.role !== "admin") {
    res.status(403).json({ error: "Administrator access required." });
    return null;
  }
  if (!sdk.hasVerifiedSecondFactor(req)) {
    res.status(403).json({ error: "Two-factor authentication is required.", code: "MFA_REQUIRED" });
    return null;
  }
  if (!(await isPrivilegedIpAllowed(req))) {
    res.status(403).json({ error: "This IP address is not allowed to use privileged tools.", code: "IP_NOT_ALLOWED" });
    return null;
  }
  return actor;
}

function queryString(req: Request, key: string) {
  const value = req.query[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function queryDate(req: Request, key: string, endOfDay = false) {
  const raw = queryString(req, key);
  if (!raw) return undefined;
  const value = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`)
    : new Date(raw);
  return Number.isNaN(value.getTime()) ? undefined : value;
}

function filters(req: Request) {
  const conditions: any[] = [];
  const action = queryString(req, "action");
  const actor = queryString(req, "actor");
  const targetId = queryString(req, "targetId");
  const from = queryDate(req, "from");
  const to = queryDate(req, "to", true);
  if (action) conditions.push(eq(auditLog.action, action));
  if (actor) conditions.push(like(auditLog.actorName, `%${actor}%`));
  if (targetId) conditions.push(like(auditLog.targetId, `%${targetId}%`));
  if (from) conditions.push(gte(auditLog.createdAt, from));
  if (to) conditions.push(lte(auditLog.createdAt, to));
  return conditions;
}

function csvCell(value: unknown) {
  const text = value == null ? "" : typeof value === "string" ? value : JSON.stringify(value);
  return `"${text.replace(/"/g, '""')}"`;
}

async function loadRows(req: Request, limit: number, offset: number) {
  const database = await getDb();
  if (!database) throw new Error("Database unavailable");
  const conditions = filters(req);
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const base = database.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(limit).offset(offset);
  const rows = where ? await base.where(where) : await base;
  return rows.map(row => {
    const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {};
    return {
      ...row,
      ip: typeof metadata.ip === "string" ? metadata.ip : null,
      userAgent: typeof metadata.userAgent === "string" ? metadata.userAgent : null,
      reason: typeof metadata.reason === "string" ? metadata.reason : null,
    };
  });
}

auditExplorerRouter.get("/", async (req, res) => {
  try {
    const actor = await requireAdmin(req, res);
    if (!actor) return;
    const database = await getDb();
    if (!database) throw new Error("Database unavailable");
    const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize) || 50));
    const page = Math.max(1, Number(req.query.page) || 1);
    const conditions = filters(req);
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const countQuery = database.select({ count: count() }).from(auditLog);
    const [totalRow] = where ? await countQuery.where(where) : await countQuery;
    const total = Number(totalRow?.count || 0);
    const rows = await loadRows(req, pageSize, (page - 1) * pageSize);
    return res.json({
      rows,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Failed to load audit log" });
  }
});

auditExplorerRouter.get("/export.csv", async (req, res) => {
  try {
    const actor = await requireAdmin(req, res);
    if (!actor) return;
    const rows = await loadRows(req, 10_000, 0);
    const header = ["createdAt", "action", "actorId", "actorName", "targetType", "targetId", "reason", "ip", "userAgent", "metadata"];
    const body = [header.join(","), ...rows.map(row => [
      row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
      row.action,
      row.actorId,
      row.actorName,
      row.targetType,
      row.targetId,
      row.reason,
      row.ip,
      row.userAgent,
      row.metadata,
    ].map(csvCell).join(","))].join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="slugly-audit-${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.send(`\uFEFF${body}`);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Audit CSV export failed" });
  }
});

import { Router, type Request, type Response } from "express";
import { isPrivilegedRole } from "./adminAccess";
import { isPrivilegedIpAllowed } from "./privilegedIp";
import { getSystemHealthSnapshot } from "./systemHealth";
import { sdk } from "./_core/sdk";

export const systemHealthRouter = Router();

systemHealthRouter.get("/", async (req: Request, res: Response) => {
  try {
    const actor = await sdk.authenticateRequest(req);
    if (!isPrivilegedRole(actor.role)) return res.status(403).json({ error: "Forbidden" });
    if (!sdk.hasVerifiedSecondFactor(req)) {
      return res.status(403).json({ error: "Two-factor authentication is required.", code: "MFA_REQUIRED" });
    }
    if (!(await isPrivilegedIpAllowed(req))) {
      return res.status(403).json({ error: "This IP address is not allowed to use privileged tools.", code: "IP_NOT_ALLOWED" });
    }
    return res.json(await getSystemHealthSnapshot());
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Failed to load system health" });
  }
});

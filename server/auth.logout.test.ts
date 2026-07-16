import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

describe("auth.logout", () => {
  it("delegates session termination to Clerk", async () => {
    const ctx: TrpcContext = {
      user: null,
      workspace: null,
      membership: null,
      req: {} as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    await expect(caller.auth.logout()).resolves.toEqual({ success: true });
  });
});

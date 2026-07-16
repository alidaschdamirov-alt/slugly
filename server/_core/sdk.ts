import { clerkClient, getAuth } from "@clerk/express";
import { ForbiddenError } from "@shared/_core/errors";
import type { Request } from "express";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";

export type AuthenticatedUser = User;

class ClerkAuthService {
  async authenticateRequest(req: Request): Promise<AuthenticatedUser> {
    const auth = getAuth(req);
    if (!auth.isAuthenticated || !auth.userId) {
      throw ForbiddenError("Invalid or missing Clerk session");
    }

    let user = await db.getUserByOpenId(auth.userId);
    if (!user) {
      user = await this.createLocalUser(auth.userId);
    } else {
      await db.upsertUser({ openId: auth.userId, lastSignedIn: new Date() });
    }

    if (!user) throw ForbiddenError("User could not be synchronized");
    return user;
  }

  private async createLocalUser(
    clerkUserId: string
  ): Promise<User | undefined> {
    const remoteUser = await clerkClient.users.getUser(clerkUserId);
    const email =
      remoteUser.primaryEmailAddress?.emailAddress ??
      remoteUser.emailAddresses[0]?.emailAddress ??
      null;
    const name =
      remoteUser.fullName ||
      remoteUser.username ||
      email?.split("@")[0] ||
      "Slugly user";

    const shouldBeAdmin =
      clerkUserId === ENV.clerkAdminUserId ||
      Boolean(
        email &&
          ENV.bootstrapAdminEmail &&
          email.toLowerCase() === ENV.bootstrapAdminEmail.toLowerCase()
      );

    await db.upsertUser({
      openId: clerkUserId,
      name,
      email,
      loginMethod: "clerk",
      role: shouldBeAdmin ? "admin" : "user",
      lastSignedIn: new Date(),
    });

    const user = await db.getUserByOpenId(clerkUserId);
    if (user && email) {
      import("../email")
        .then(({ sendTemplatedEmail }) =>
          sendTemplatedEmail("welcome", email, {
            name,
            dashboardUrl: "/dashboard",
          })
        )
        .catch(() => undefined);
    }
    return user;
  }
}

export const sdk = new ClerkAuthService();

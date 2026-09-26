import { drizzle } from "drizzle-orm/mysql2";
import { describe, expect, it } from "vitest";
import { clicks } from "../drizzle/schema";
import { canonicalClickFilter } from "./clickMetrics";

describe("canonical click metric", () => {
  it("uses the same recorded redirects as link clickCount", () => {
    const database = drizzle({ client: {} as any });
    const query = database
      .select({ count: clicks.id })
      .from(clicks)
      .where(canonicalClickFilter([11, 12], 1_700_000_000_000));
    const normalizedSql = query.toSQL().sql.replaceAll("`", "").toLowerCase();

    expect(normalizedSql).toContain("clicks.linkid in");
    expect(normalizedSql).toContain("clicks.timestamp >=");
    expect(normalizedSql).not.toContain("isbot");
  });
});

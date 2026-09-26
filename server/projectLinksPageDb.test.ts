import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { describe, expect, it } from "vitest";
import { links } from "../drizzle/schema";
import { buildProjectLinksItemsQuery, type ProjectLinksSqlPageInput } from "./projectLinksPageDb";

describe("project links SQL", () => {
  it("joins click totals to the current outer link id", () => {
    const database = drizzle({ client: {} as any });
    const input: ProjectLinksSqlPageInput = {
      projectId: 6,
      page: 1,
      limit: 50,
      sortField: "createdAt",
      sortDir: "desc",
    };

    const query = buildProjectLinksItemsQuery(
      database as any,
      input,
      [eq(links.projectId, input.projectId)],
      1,
    );
    const normalizedSql = query.toSQL().sql.replaceAll("`", "").toLowerCase();

    expect(normalizedSql).toContain("left join (select linkid, count(id) as click_count from clicks group by clicks.linkid) click_counts");
    expect(normalizedSql).toContain("on click_counts.linkid = links.id");
    expect(normalizedSql).not.toContain("where linkid = id");
  });
});

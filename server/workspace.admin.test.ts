import { describe, expect, it } from "vitest";
import * as workspace from "./workspace";

describe("admin workspace helpers", () => {
  it("exports adminListWorkspaces as a callable helper", () => {
    expect(typeof workspace.adminListWorkspaces).toBe("function");
  });
});

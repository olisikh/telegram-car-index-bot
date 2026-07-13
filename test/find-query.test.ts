import { describe, expect, it } from "vitest";
import { normalizeFindQuery } from "../src/find-query.js";

describe("normalizeFindQuery", () => {
  it("normalizes Ukrainian lookalikes and removes separators", () => {
    expect(normalizeFindQuery(" аx-809 ")).toBe("AX809");
  });

  it("rejects a query that is too long for callback data", () => {
    expect(normalizeFindQuery("AX1234567890")).toBeUndefined();
  });
});

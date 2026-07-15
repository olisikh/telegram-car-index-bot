import { describe, expect, it } from "bun:test";
import { normalizeFindQuery } from "../src/find-query";

describe("normalizeFindQuery", () => {
  it("normalizes Ukrainian lookalikes and removes separators", () => {
    expect(normalizeFindQuery(" аx-809 ")).toBe("AX809");
  });

  it("rejects a query that is too long for callback data", () => {
    expect(normalizeFindQuery("AX1234567890")).toBeUndefined();
  });
});

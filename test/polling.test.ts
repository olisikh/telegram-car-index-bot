import { describe, expect, it } from "vitest";
import { allowedUpdates, nextOffset } from "../src/polling.js";

describe("nextOffset", () => {
  it("requests message and callback-query updates", () => {
    expect(allowedUpdates).toEqual(["message", "callback_query"]);
  });

  it("advances beyond the highest processed update", () => {
    expect(nextOffset(1, [{ update_id: 7 }, { update_id: 9 }])).toBe(10);
  });

  it("does not advance when no updates arrive", () => {
    expect(nextOffset(10, [])).toBe(10);
  });
});

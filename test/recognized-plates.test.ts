import { describe, expect, it } from "bun:test";
import { recognizedPlates } from "../src/recognized-plates";

describe("recognizedPlates", () => {
  it("normalizes, validates, deduplicates, and rejects malformed reader output", () => {
    expect(recognizedPlates('{"plates":["АА 1234 ВВ", "not-a-plate", "2923", "AA1234BB"]}')).toEqual([
      "AA1234BB",
      "2923",
    ]);
    expect(recognizedPlates("not json")).toEqual([]);
    expect(recognizedPlates('{"plates":"AA1234BB"}')).toEqual([]);
  });
});

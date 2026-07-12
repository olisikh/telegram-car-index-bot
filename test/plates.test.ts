import { describe, expect, it } from "vitest";
import { extractPlates, normalizePlate } from "../src/plates.js";

describe("normalizePlate", () => {
  it("normalizes whitespace, case, and Ukrainian lookalike characters", () => {
    expect(normalizePlate(" аА 1234 вВ ")).toBe("AA1234BB");
  });

  it("returns undefined for a non-Ukrainian-plate value", () => {
    expect(normalizePlate("not a plate")).toBeUndefined();
  });
});

describe("extractPlates", () => {
  it("extracts unique Ukrainian plates from free text", () => {
    expect(extractPlates("готово: АА 1234 ВВ, повтор AA1234BB; ще KA 0001 AX"))
      .toEqual(["AA1234BB", "KA0001AX"]);
  });
});

import { describe, expect, it } from "bun:test";
import { extractPlates, normalizePlate } from "../src/plates";

describe("normalizePlate", () => {
  it("normalizes case and Ukrainian lookalike characters in a jammed Ukrainian plate", () => {
    expect(normalizePlate("аА1234вВ")).toBe("AA1234BB");
  });

  it("accepts a Ukrainian National Police four-digit plate", () => {
    expect(normalizePlate("2793")).toBe("2793");
  });

  it("accepts current Ukrainian all-Latin registration series", () => {
    expect(normalizePlate("AE1131YF")).toBe("AE1131YF");
  });

  it("rejects plate values containing separators or spaces", () => {
    expect(normalizePlate("AA 1234 BB")).toBeUndefined();
    expect(normalizePlate("AA-1234-BB")).toBeUndefined();
  });

  it.each([
    ["Poland", "WX1234A"],
    ["Germany", "BAB1234"],
    ["Lithuania", "ABC123"],
    ["Romania", "B123ABC"],
    ["Slovakia", "BA123CD"],
    ["Hungary", "ABCD123"],
    ["Czechia", "1A23456"],
  ])("accepts a jammed standard %s plate", (_country, plate) => {
    expect(normalizePlate(plate)).toBe(plate);
  });

  it("returns undefined for an unsupported value", () => {
    expect(normalizePlate("not a plate")).toBeUndefined();
  });
});

describe("extractPlates", () => {
  it("extracts unique jammed Ukrainian plates from free text", () => {
    expect(extractPlates("готово: АА1234ВВ, повтор AA1234BB; ще KA0001AX"))
      .toEqual(["AA1234BB", "KA0001AX"]);
  });

  it("recognizes a hashtagged jammed plate", () => {
    expect(extractPlates("#АА1234ВВ")).toEqual(["AA1234BB"]);
  });
});

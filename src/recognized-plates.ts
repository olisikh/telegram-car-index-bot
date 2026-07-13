import { normalizePlate } from "./plates.js";

const normalizeRecognizedPlate = (value: string): string | undefined =>
  normalizePlate(value.replace(/[\s-]/gu, ""));

export const recognizedPlates = (content: string): ReadonlyArray<string> => {
  try {
    const parsed: unknown = JSON.parse(content);
    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { plates?: unknown }).plates)) return [];
    return [...new Set((parsed as { plates: unknown[] }).plates
      .filter((plate): plate is string => typeof plate === "string")
      .map(normalizeRecognizedPlate)
      .filter((plate): plate is string => plate !== undefined))];
  } catch {
    return [];
  }
};

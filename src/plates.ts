const LOOKALIKES: Record<string, string> = {
  А: "A", В: "B", С: "C", Е: "E", Н: "H", І: "I", К: "K",
  М: "M", О: "O", Р: "P", Т: "T", Х: "X",
};

// Standard civilian plates, entered as one contiguous token. These patterns are
// intentionally country-specific rather than a permissive generic EU regex.
const PLATE_FORMATS: Record<string, RegExp> = {
  // Current Ukrainian civilian series can be written entirely with Latin letters.
  // Keep Cyrillic lookalike normalization above for legacy physical plates.
  UA: /^[A-Z]{2}\d{4}[A-Z]{2}$/,
  PL: /^[A-Z]{2,3}[A-Z0-9]{4,5}$/,
  DE: /^[A-Z]{2,5}\d{1,4}$/,
  LT: /^[A-Z]{3}\d{3}$/,
  RO: /^(?:B|[A-Z]{2})\d{2,3}[A-Z]{3}$/,
  SK: /^[A-Z]{2}\d{3}[A-Z]{2}$/,
  HU: /^(?:[A-Z]{3}|[A-Z]{4})\d{3}$/,
  CZ: /^\d[A-Z]\d{5}$/,
};

const CANDIDATE = /(?<![A-ZА-ЯІЇЄҐ0-9])([A-ZА-ЯІЇЄҐ]{2}\d{4}[A-ZА-ЯІЇЄҐ]{2})(?![A-ZА-ЯІЇЄҐ0-9])/giu;

export const normalizePlate = (value: string): string | undefined => {
  const normalized = value
    .toUpperCase()
    .replace(/[АВСЕНІКМОРТХ]/gu, (character) => LOOKALIKES[character] ?? character);

  return Object.values(PLATE_FORMATS).some((format) => format.test(normalized))
    ? normalized
    : undefined;
};

export const extractPlates = (text: string): ReadonlyArray<string> =>
  [...new Set([...text.matchAll(CANDIDATE)]
    .map(([candidate]) => normalizePlate(candidate))
    .filter((plate): plate is string => plate !== undefined))];

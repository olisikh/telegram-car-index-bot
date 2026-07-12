const LOOKALIKES: Record<string, string> = {
  А: "A", В: "B", С: "C", Е: "E", Н: "H", І: "I", К: "K",
  М: "M", О: "O", Р: "P", Т: "T", Х: "X",
};

const UKRAINIAN_PLATE = /^[ABCEHIKMOPTX]{2}\d{4}[ABCEHIKMOPTX]{2}$/;
const CANDIDATE = /(?<![A-ZА-ЯІЇЄҐ])([A-ZА-ЯІЇЄҐ]{2}\s*\d{4}\s*[A-ZА-ЯІЇЄҐ]{2})(?![A-ZА-ЯІЇЄҐ])/giu;

export const normalizePlate = (value: string): string | undefined => {
  const normalized = value
    .toUpperCase()
    .replace(/[АВСЕНІКМОРТХ]/gu, (character) => LOOKALIKES[character] ?? character)
    .replace(/\s/gu, "");

  return UKRAINIAN_PLATE.test(normalized) ? normalized : undefined;
};

export const extractPlates = (text: string): ReadonlyArray<string> =>
  [...new Set([...text.matchAll(CANDIDATE)]
    .map(([candidate]) => normalizePlate(candidate))
    .filter((plate): plate is string => plate !== undefined))];

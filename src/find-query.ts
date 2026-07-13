import { LOOKALIKES } from "./plates.js";

export const MAX_FIND_QUERY_LENGTH = 10;

export const normalizeFindQuery = (query: string): string | undefined => {
  const normalized = query
    .toUpperCase()
    .replace(/[АВСЕНІКМОРТХ]/gu, (character) => LOOKALIKES[character] ?? character)
    .replace(/[^A-Z0-9]/gu, "");
  return normalized.length <= MAX_FIND_QUERY_LENGTH ? normalized : undefined;
};

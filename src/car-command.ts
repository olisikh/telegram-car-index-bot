import { normalizePlate } from "./plates.js";

const CAR_COMMAND = /^\/car(?:@\w+)?\s+(\S+)/iu;

export const carCommandPlate = (text: string): string | undefined =>
  normalizePlate(text.match(CAR_COMMAND)?.[1] ?? "");

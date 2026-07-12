import { extractPlates } from "./plates.js";

const CAR_COMMAND = /^\/car(?:@\w+)?(?:\s|$)/iu;

export const carCommandPlate = (caption: string): string | undefined =>
  CAR_COMMAND.test(caption) ? extractPlates(caption)[0] : undefined;

import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export interface CollectedCrop {
  readonly sampleId: string;
  readonly cropPath: string;
  readonly detectorConfidence: number;
  readonly profile: string;
}

interface CollectionManifestEntry {
  readonly schemaVersion: 1;
  readonly capturedAt: string;
  readonly reader: string;
  readonly validatedPlates: ReadonlyArray<string>;
  readonly reviewStatus: "unreviewed";
  readonly crops: ReadonlyArray<CollectedCrop>;
}

const validCropPath = (value: unknown): value is string =>
  typeof value === "string" && value.startsWith("crops/") && value.endsWith(".png") && !value.includes("..");

export const collectedCrops = (content: string): ReadonlyArray<CollectedCrop> => {
  try {
    const parsed = JSON.parse(content) as { captures?: unknown };
    if (!Array.isArray(parsed.captures)) return [];
    return parsed.captures.flatMap((capture): ReadonlyArray<CollectedCrop> => {
      if (!capture || typeof capture !== "object") return [];
      const value = capture as Record<string, unknown>;
      if (typeof value.sampleId !== "string" || !validCropPath(value.cropPath)
        || typeof value.detectorConfidence !== "number" || !Number.isFinite(value.detectorConfidence)
        || typeof value.profile !== "string") return [];
      return [{
        sampleId: value.sampleId,
        cropPath: value.cropPath,
        detectorConfidence: value.detectorConfidence,
        profile: value.profile,
      }];
    });
  } catch {
    return [];
  }
};

export const appendCollectionManifest = async (
  directory: string,
  reader: string,
  validatedPlates: ReadonlyArray<string>,
  crops: ReadonlyArray<CollectedCrop>,
): Promise<void> => {
  if (crops.length === 0) return;
  const entry: CollectionManifestEntry = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    reader,
    validatedPlates,
    reviewStatus: "unreviewed",
    crops,
  };
  await mkdir(directory, { recursive: true });
  await appendFile(join(directory, "manifest.jsonl"), `${JSON.stringify(entry)}\n`, "utf8");
};

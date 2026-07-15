import { Effect } from "effect";
import { indexRecognizedPhotoMessage, type IndexStore } from "./indexing.js";
import type { PlateAnalyzer } from "./plate-analyzer.js";
import type { TimedRecognition } from "./recognition-timings.js";

export interface PhotoDownloader {
  readonly download: (fileId: string) => Promise<Uint8Array>;
}

export interface PhotoRecognitionDependencies extends PhotoDownloader, PlateAnalyzer {
  readonly store: IndexStore;
}

export interface IncomingPhoto {
  readonly chatId: number;
  readonly messageId: number;
  readonly fileId: string;
  readonly chatUsername?: string;
  readonly mediaGroupId?: string;
}

export const processPhotoRecognition = async (
  dependencies: PhotoRecognitionDependencies,
  photo: IncomingPhoto,
): Promise<TimedRecognition> => {
  const image = await dependencies.download(photo.fileId);
  const recognition = dependencies.analyzeTimed
    ? await dependencies.analyzeTimed(image)
    : { plates: await dependencies.analyze(image), timings: {} };
  await Effect.runPromise(indexRecognizedPhotoMessage(dependencies.store, {
    chatId: photo.chatId,
    messageId: photo.messageId,
    chatUsername: photo.chatUsername,
    mediaGroupId: photo.mediaGroupId,
    plates: recognition.plates,
  }));
  return recognition;
};

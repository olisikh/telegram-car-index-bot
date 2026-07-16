import { Effect } from "effect";
import { indexRecognizedPhotoMessage, type IndexStore } from "./indexing";
import type { PlateAnalyzer } from "./plate-analyzer";
import type { TimedRecognition } from "./recognition-timings";

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

export interface PhotoRecognitionOptions {
  readonly collectionDirectory?: string;
}

export const processPhotoRecognition = async (
  dependencies: PhotoRecognitionDependencies,
  photo: IncomingPhoto,
  options?: PhotoRecognitionOptions,
): Promise<TimedRecognition> => {
  const image = await dependencies.download(photo.fileId);
  const recognition = dependencies.analyzeTimed
    ? options ? await dependencies.analyzeTimed(image, options) : await dependencies.analyzeTimed(image)
    : { plates: options ? await dependencies.analyze(image, options) : await dependencies.analyze(image), timings: {} };
  await Effect.runPromise(indexRecognizedPhotoMessage(dependencies.store, {
    chatId: photo.chatId,
    messageId: photo.messageId,
    chatUsername: photo.chatUsername,
    mediaGroupId: photo.mediaGroupId,
    plates: recognition.plates,
  }));
  return recognition;
};

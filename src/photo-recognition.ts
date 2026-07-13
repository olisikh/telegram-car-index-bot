import { Effect } from "effect";
import { indexRecognizedPhotoMessage, type IndexStore } from "./indexing.js";
import type { VisionAnalyzer } from "./ollama-vision.js";

export type RecognitionMode = "shadow" | "index";

export interface PhotoDownloader {
  readonly download: (fileId: string) => Promise<Uint8Array>;
}

export interface PhotoRecognitionDependencies extends PhotoDownloader, VisionAnalyzer {
  readonly store: IndexStore;
  readonly mode: RecognitionMode;
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
): Promise<ReadonlyArray<string>> => {
  const image = await dependencies.download(photo.fileId);
  const plates = await dependencies.analyze(image);
  if (dependencies.mode === "index") {
    await Effect.runPromise(indexRecognizedPhotoMessage(dependencies.store, {
      chatId: photo.chatId,
      messageId: photo.messageId,
      chatUsername: photo.chatUsername,
      mediaGroupId: photo.mediaGroupId,
      plates,
    }));
  }
  return plates;
};

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import "dotenv/config";
import { Bot, InlineKeyboard } from "grammy";
import { Effect } from "effect";
import { groupCommands } from "./commands.js";
import { DetectorCropVisionAnalyzer } from "./detector-crop-analyzer.js";
import { PythonFastPlateOcrAnalyzer } from "./fast-plate-ocr-analyzer.js";
import { fastPlateOcrMode } from "./fast-plate-ocr-policy.js";
import { clampPage, findCallbackData, listCallbackData, LIST_PAGE_SIZE, pageCount, parseListCallback } from "./car-list.js";
import { SqliteIndexStore } from "./database.js";
import { formatFindResult } from "./find-results.js";
import { messageLink } from "./message-link.js";
import { OllamaVisionAnalyzer } from "./ollama-vision.js";
import { PythonPlateCropDetector } from "./plate-detector.js";
import { LOOKALIKES } from "./plates.js";
import { processPhotoRecognition, type RecognitionMode } from "./photo-recognition.js";

const normalizeFindQuery = (query: string): string => query
  .toUpperCase()
  .replace(/[АВСЕНІКМОРТХ]/gu, (character) => LOOKALIKES[character] ?? character)
  .replace(/\s+/gu, "");
import {
  recognitionCrashFeedback,
  recognitionNoPlateFeedback,
  recognitionSuccessFeedback,
  recognitionTimeoutFeedback,
} from "./recognition-feedback.js";
import { recognitionStrategyFrom } from "./recognition-strategy.js";
import { runLongPolling } from "./polling.js";
import { SerialQueue } from "./serial-queue.js";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required");

const allowedChats = new Set((process.env.ALLOWED_CHAT_IDS ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean));

if (allowedChats.size === 0) {
  throw new Error("ALLOWED_CHAT_IDS is required to prevent indexing unauthorised chats");
}

const recognitionModeValue = process.env.PHOTO_RECOGNITION_MODE ?? "shadow";
if (recognitionModeValue !== "shadow" && recognitionModeValue !== "index") {
  throw new Error("PHOTO_RECOGNITION_MODE must be shadow or index");
}
const requestedRecognitionMode: RecognitionMode = recognitionModeValue;
const recognitionStrategy = recognitionStrategyFrom(process.env.PHOTO_RECOGNITION_STRATEGY);
const recognitionMode = recognitionStrategy === "detector-fast-ocr"
  ? fastPlateOcrMode(requestedRecognitionMode, process.env.FAST_PLATE_OCR_ALLOW_INDEX)
  : requestedRecognitionMode;
const ollamaModel = process.env.OLLAMA_MODEL ?? "qwen2.5vl:7b";
const fastPlateOcrModel = process.env.FAST_PLATE_OCR_MODEL ?? "cct-s-v2-global-model";
const ollamaBaseUrl = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
const ollamaTimeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS ?? "60000");
if (!Number.isSafeInteger(ollamaTimeoutMs) || ollamaTimeoutMs < 1) {
  throw new Error("OLLAMA_TIMEOUT_MS must be a positive integer");
}
const detectorPythonPath = resolve(process.env.PLATE_DETECTOR_PYTHON ?? "./.vision-venv/bin/python");
const detectorScriptPath = resolve(process.env.PLATE_DETECTOR_SCRIPT ?? "./scripts/detect_plate_crops.py");
const detectorModelPath = resolve(process.env.PLATE_DETECTOR_MODEL ?? "./models/license-plate-detector.pt");
if (recognitionStrategy !== "full-image") {
  for (const path of [detectorPythonPath, detectorScriptPath, detectorModelPath]) {
    if (!existsSync(path)) throw new Error(`${recognitionStrategy} mode requires local file: ${path}`);
  }
}

const database = new SqliteIndexStore(process.env.DATABASE_PATH ?? "./data/index.db");
const bot = new Bot(token);
const photoQueue = new SerialQueue();
const fullImageAnalyzer = new OllamaVisionAnalyzer({
  baseUrl: ollamaBaseUrl,
  model: ollamaModel,
  timeoutMs: ollamaTimeoutMs,
});
const visionAnalyzer = recognitionStrategy === "detector-crop"
  ? new DetectorCropVisionAnalyzer(
    new PythonPlateCropDetector({
      pythonPath: detectorPythonPath,
      scriptPath: detectorScriptPath,
      modelPath: detectorModelPath,
    }),
    fullImageAnalyzer,
  )
  : recognitionStrategy === "detector-fast-ocr"
    ? new PythonFastPlateOcrAnalyzer({
      pythonPath: detectorPythonPath,
      scriptPath: detectorScriptPath,
      detectorModelPath,
      ocrModel: fastPlateOcrModel,
      timeoutMs: ollamaTimeoutMs,
    })
    : fullImageAnalyzer;
const activeReader = recognitionStrategy === "detector-fast-ocr"
  ? `fast-plate-ocr:${fastPlateOcrModel}`
  : `ollama:${ollamaModel}`;

const allowed = (chatId: number): boolean => allowedChats.has(String(chatId));

const chatUsername = (chat: { username?: string }): string | undefined => chat.username;

const findReplyText = async (query: string, chatId: number): Promise<string> => {
  const normalizedQuery = normalizeFindQuery(query);

  if (normalizedQuery.length < 3) {
    return "Пошук за номером: введіть щонайменше 3 символи.";
  }

  const results = await Effect.runPromise(database.searchPlates(normalizedQuery, chatId));
  if (results.length === 0) return `Для ${normalizedQuery} нічого не знайдено.`;
  const links = results.map((result, index) => formatFindResult(result, index + 1));
  return `Знайдено ${results.length} повідомлень для ${normalizedQuery}:\n${links.join("\n")}`;
};

const listView = async (chatId: number, requestedPage: number): Promise<{
  readonly text: string;
  readonly keyboard: InlineKeyboard;
} | undefined> => {
  const initial = await Effect.runPromise(database.listCars(chatId, LIST_PAGE_SIZE, requestedPage * LIST_PAGE_SIZE));
  if (initial.total === 0) return undefined;
  const page = clampPage(requestedPage, initial.total);
  const result = page === requestedPage
    ? initial
    : await Effect.runPromise(database.listCars(chatId, LIST_PAGE_SIZE, page * LIST_PAGE_SIZE));
  const pages = pageCount(result.total);
  const keyboard = new InlineKeyboard();
  for (const car of result.cars) keyboard.text(car.plate, findCallbackData(car.plate)).row();
  if (pages > 1) {
    if (page > 0) keyboard.text("‹", listCallbackData(page - 1));
    keyboard.text(`${page + 1} / ${pages}`, "noop");
    if (page < pages - 1) keyboard.text("›", listCallbackData(page + 1));
  }
  return {
    text: `Авто: ${result.total}. Від найновіших до найстаріших:`,
    keyboard,
  };
};

const downloadPhoto = async (fileId: string): Promise<Uint8Array> => {
  const remoteFile = await bot.api.getFile(fileId);
  if (!remoteFile.file_path) throw new Error("Telegram did not return a file path for the photo");
  const response = await fetch(`https://api.telegram.org/file/bot${token}/${remoteFile.file_path}`, {
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`Telegram photo download failed: ${response.status}`);
  const image = new Uint8Array(await response.arrayBuffer());
  if (image.byteLength > 20 * 1024 * 1024) throw new Error("Telegram photo exceeds 20 MiB analysis limit");
  return image;
};

// Receipt telemetry deliberately contains no message text, captions, image bytes, or model output.
bot.use(async (ctx, next) => {
  const message = ctx.update.message;
  if (message) {
    console.info(
      `received chat=${message.chat.id} message=${message.message_id}`
      + ` photo=${"photo" in message} video=${"video" in message} animation=${"animation" in message}`
      + ` document=${"document" in message} caption=${"caption" in message}`
      + ` text=${"text" in message} reply=${message.reply_to_message?.message_id ?? "-"}`,
    );
  }
  await next();
});

bot.command("start", async (ctx) => {
  if (!allowed(ctx.chat.id)) return;
  await ctx.reply("Готово. Надішли фото авто — бот спробує розпізнати ДНЗ.\nПошук: /find AA1234BB · Список: /list\nСтатус: /verbose on або /verbose off");
});

bot.command("verbose", async (ctx) => {
  if (!allowed(ctx.chat.id)) return;
  const value = ctx.match.trim().toLowerCase();
  if (value !== "on" && value !== "off") {
    await ctx.reply("Формат: /verbose on або /verbose off");
    return;
  }
  const enabled = value === "on";
  await Effect.runPromise(database.setVerboseRecognition(ctx.chat.id, enabled));
  await ctx.reply(enabled
    ? "🔔 Детальний статус розпізнавання увімкнено для цього чату."
    : "🔕 Детальний статус розпізнавання вимкнено для цього чату.");
});

bot.on("message:photo", async (ctx) => {
  if (!allowed(ctx.chat.id)) return;
  const largestPhoto = ctx.message.photo.at(-1);
  if (!largestPhoto) return;

  const startedAt = Date.now();
  const sourcePhotoUrl = messageLink({
    chatId: ctx.chat.id,
    messageId: ctx.message.message_id,
    username: chatUsername(ctx.chat),
  });
  try {
    const recognition = await photoQueue.enqueue(async () => processPhotoRecognition({
      store: database,
      download: downloadPhoto,
      analyze: visionAnalyzer.analyze,
      analyzeTimed: visionAnalyzer.analyzeTimed,
      mode: recognitionMode,
    }, {
      chatId: ctx.chat.id,
      messageId: ctx.message.message_id,
      fileId: largestPhoto.file_id,
      chatUsername: chatUsername(ctx.chat),
      mediaGroupId: ctx.message.media_group_id,
    }));
    const { plates, timings } = recognition;
    const verbose = await Effect.runPromise(database.verboseRecognitionEnabled(ctx.chat.id));
    if (verbose) {
      const feedback = plates.length > 0
        ? recognitionSuccessFeedback(sourcePhotoUrl, plates, Date.now() - startedAt, timings)
        : recognitionNoPlateFeedback(sourcePhotoUrl, Date.now() - startedAt, timings);
      await ctx.reply(feedback, { parse_mode: "HTML", link_preview_options: { is_disabled: true } });
    }
    console.info(
      `photo recognition chat=${ctx.chat.id} message=${ctx.message.message_id}`
      + ` candidates=${plates.length} mode=${recognitionMode}`
      + ` detectionMs=${timings.detectionMs ?? "n/a"}`
      + ` croppingMs=${timings.croppingMs ?? "n/a"}`
      + ` ocrMs=${timings.ocrMs ?? "n/a"}`,
    );
  } catch (error) {
    const verbose = await Effect.runPromise(database.verboseRecognitionEnabled(ctx.chat.id));
    if (verbose) {
      const feedback = error instanceof Error && error.name === "TimeoutError"
        ? recognitionTimeoutFeedback(sourcePhotoUrl, Date.now() - startedAt)
        : recognitionCrashFeedback(sourcePhotoUrl, Date.now() - startedAt);
      await ctx.reply(feedback, { parse_mode: "HTML", link_preview_options: { is_disabled: true } });
    }
    console.error(
      `photo recognition failed chat=${ctx.chat.id} message=${ctx.message.message_id}`,
      error instanceof Error ? error.message : String(error),
    );
  }
});

bot.command("list", async (ctx) => {
  if (!allowed(ctx.chat.id)) return;
  const view = await listView(ctx.chat.id, 0);
  if (!view) {
    await ctx.reply("Ще немає проіндексованих авто.");
    return;
  }
  await ctx.reply(view.text, { reply_markup: view.keyboard });
});

bot.command("find", async (ctx) => {
  if (!allowed(ctx.chat.id)) return;
  const query = ctx.match.trim();
  if (query.length < 3) {
    await ctx.reply("Пошук за номером: введіть щонайменше 3 символи.");
    return;
  }
  await ctx.reply(await findReplyText(query, ctx.chat.id), {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  });
});

bot.on("callback_query:data", async (ctx) => {
  const chat = ctx.callbackQuery.message?.chat;
  const action = parseListCallback(ctx.callbackQuery.data);
  if (!chat || !allowed(chat.id) || !action) {
    await ctx.answerCallbackQuery();
    return;
  }
  if (action.kind === "find") {
    const query = normalizeFindQuery(action.plate);
    await ctx.answerCallbackQuery();
    if (query.length < 3) return;
    await ctx.deleteMessage();
    await ctx.reply(await findReplyText(query, chat.id), {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
    return;
  }

  const view = await listView(chat.id, action.page);
  await ctx.answerCallbackQuery();
  if (!view) {
    await ctx.editMessageText("Ще немає проіндексованих авто.");
    return;
  }
  await ctx.editMessageText(view.text, { reply_markup: view.keyboard });
});

await bot.api.setMyCommands(groupCommands, { scope: { type: "all_group_chats" } });
console.info(`Bot is running; photo recognition mode=${recognitionMode} strategy=${recognitionStrategy} reader=${activeReader}`);
await runLongPolling(bot);

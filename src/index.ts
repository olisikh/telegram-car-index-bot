import { existsSync } from "node:fs";
import { resolve } from "node:path";
import "dotenv/config";
import { Bot, InlineKeyboard } from "grammy";
import { Effect } from "effect";
import { groupCommands } from "./commands.js";
import { PythonFastPlateOcrAnalyzer } from "./fast-plate-ocr-analyzer.js";
import {
  clampPage,
  findCallbackData,
  listCallbackData,
  LIST_PAGE_SIZE,
  pageCount,
  parseListCallback,
  searchCallbackData,
} from "./car-list.js";
import { SqliteIndexStore } from "./database.js";
import { formatFindResult } from "./find-results.js";
import { DEFAULT_LOCALE, messages, parseLocale, type Locale } from "./i18n.js";
import { messageLink } from "./message-link.js";
import { normalizeFindQuery } from "./find-query.js";
import { processPhotoRecognition } from "./photo-recognition.js";
import {
  recognitionCrashFeedback,
  recognitionNoPlateFeedback,
  recognitionSuccessFeedback,
  recognitionTimeoutFeedback,
} from "./recognition-feedback.js";
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

const fastPlateOcrModel = process.env.FAST_PLATE_OCR_MODEL ?? "cct-s-v2-global-model";
const recognitionTimeoutMs = Number(process.env.PHOTO_RECOGNITION_TIMEOUT_MS ?? "60000");
const recoveryAttempts = Number(process.env.PHOTO_RECOGNITION_RECOVERY_ATTEMPTS ?? "2");
if (!Number.isSafeInteger(recognitionTimeoutMs) || recognitionTimeoutMs < 1) {
  throw new Error("PHOTO_RECOGNITION_TIMEOUT_MS must be a positive integer");
}
if (!Number.isSafeInteger(recoveryAttempts) || recoveryAttempts < 0 || recoveryAttempts > 2) {
  throw new Error("PHOTO_RECOGNITION_RECOVERY_ATTEMPTS must be an integer from 0 to 2");
}
const detectorPythonPath = resolve(process.env.PLATE_DETECTOR_PYTHON ?? "./.vision-venv/bin/python");
const detectorScriptPath = resolve(process.env.PLATE_DETECTOR_SCRIPT ?? "./scripts/detect_and_read_plates.py");
const detectorModelPath = resolve(process.env.PLATE_DETECTOR_MODEL ?? "./models/license-plate-detector.pt");
for (const path of [detectorPythonPath, detectorScriptPath, detectorModelPath]) {
  if (!existsSync(path)) throw new Error(`detector-fast-ocr requires local file: ${path}`);
}

const database = new SqliteIndexStore(process.env.DATABASE_PATH ?? "./data/index.db");
const bot = new Bot(token);
const photoQueue = new SerialQueue();
const visionAnalyzer = new PythonFastPlateOcrAnalyzer({
  pythonPath: detectorPythonPath,
  scriptPath: detectorScriptPath,
  detectorModelPath,
  ocrModel: fastPlateOcrModel,
  timeoutMs: recognitionTimeoutMs,
  recoveryAttempts,
});
const activeReader = `fast-plate-ocr:${fastPlateOcrModel}`;

const allowed = (chatId: number): boolean => allowedChats.has(String(chatId));

const chatUsername = (chat: { username?: string }): string | undefined => chat.username;

const exactFindReplyText = async (locale: Locale, plate: string, chatId: number): Promise<string> => {
  const text = messages(locale);
  const results = await Effect.runPromise(database.find(plate, chatId));
  if (results.length === 0) return text.nothingFound(plate);
  const links = results.map((result, index) => formatFindResult(locale, result, index + 1));
  return text.findResults(results.length, plate, links.join("\n"));
};

const findView = async (locale: Locale, query: string, chatId: number, requestedPage = 0): Promise<{
  readonly text: string;
  readonly keyboard?: InlineKeyboard;
}> => {
  const text = messages(locale);
  const normalizedQuery = normalizeFindQuery(query);
  if (!normalizedQuery || normalizedQuery.length < 3) {
    return { text: text.findUsage };
  }

  const initial = await Effect.runPromise(database.searchPlateChoices(
    normalizedQuery,
    chatId,
    LIST_PAGE_SIZE,
    requestedPage * LIST_PAGE_SIZE,
  ));
  if (initial.total === 0) return { text: text.nothingFound(normalizedQuery) };
  if (initial.total === 1) return { text: await exactFindReplyText(locale, initial.plates[0], chatId) };

  const page = clampPage(requestedPage, initial.total);
  const result = page === requestedPage
    ? initial
    : await Effect.runPromise(database.searchPlateChoices(
      normalizedQuery,
      chatId,
      LIST_PAGE_SIZE,
      page * LIST_PAGE_SIZE,
    ));
  const keyboard = new InlineKeyboard();
  for (const plate of result.plates) keyboard.text(plate, findCallbackData(plate)).row();
  const pages = pageCount(result.total);
  if (pages > 1) {
    if (page > 0) keyboard.text("‹", searchCallbackData(normalizedQuery, page - 1));
    keyboard.text(`${page + 1} / ${pages}`, "noop");
    if (page < pages - 1) keyboard.text("›", searchCallbackData(normalizedQuery, page + 1));
  }
  return {
    text: text.findChoices(result.total, normalizedQuery),
    keyboard,
  };
};

const listView = async (locale: Locale, chatId: number, requestedPage: number): Promise<{
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
    text: messages(locale).carList(result.total),
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
  const locale = await Effect.runPromise(database.chatLocale(ctx.chat.id));
  await ctx.reply(messages(locale).start);
});

bot.command("lang", async (ctx) => {
  if (!allowed(ctx.chat.id)) return;
  const locale = parseLocale(ctx.match);
  if (!locale) {
    const currentLocale = await Effect.runPromise(database.chatLocale(ctx.chat.id));
    await ctx.reply(messages(currentLocale).languageUsage);
    return;
  }
  await Effect.runPromise(database.setChatLocale(ctx.chat.id, locale));
  await ctx.reply(messages(locale).languageChanged);
});

bot.command("verbose", async (ctx) => {
  if (!allowed(ctx.chat.id)) return;
  const locale = await Effect.runPromise(database.chatLocale(ctx.chat.id));
  const text = messages(locale);
  const value = ctx.match.trim().toLowerCase();
  if (value !== "on" && value !== "off") {
    await ctx.reply(text.verboseUsage);
    return;
  }
  const enabled = value === "on";
  await Effect.runPromise(database.setVerboseRecognition(ctx.chat.id, enabled));
  await ctx.reply(enabled
    ? text.verboseEnabled
    : text.verboseDisabled);
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
      const locale = await Effect.runPromise(database.chatLocale(ctx.chat.id));
      const feedback = plates.length > 0
        ? recognitionSuccessFeedback(locale, sourcePhotoUrl, plates, Date.now() - startedAt, timings)
        : recognitionNoPlateFeedback(locale, sourcePhotoUrl, Date.now() - startedAt, timings);
      await ctx.reply(feedback, { parse_mode: "HTML", link_preview_options: { is_disabled: true } });
    }
    console.info(
      `photo recognition chat=${ctx.chat.id} message=${ctx.message.message_id}`
      + ` candidates=${plates.length}`
      + ` detectionMs=${timings.detectionMs ?? "n/a"}`
      + ` croppingMs=${timings.croppingMs ?? "n/a"}`
      + ` ocrMs=${timings.ocrMs ?? "n/a"}`,
    );
  } catch (error) {
    const verbose = await Effect.runPromise(database.verboseRecognitionEnabled(ctx.chat.id));
    if (verbose) {
      const locale = await Effect.runPromise(database.chatLocale(ctx.chat.id));
      const feedback = error instanceof Error && error.name === "TimeoutError"
        ? recognitionTimeoutFeedback(locale, sourcePhotoUrl, Date.now() - startedAt)
        : recognitionCrashFeedback(locale, sourcePhotoUrl, Date.now() - startedAt);
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
  const locale = await Effect.runPromise(database.chatLocale(ctx.chat.id));
  const view = await listView(locale, ctx.chat.id, 0);
  if (!view) {
    await ctx.reply(messages(locale).noIndexedCars);
    return;
  }
  await ctx.reply(view.text, { reply_markup: view.keyboard });
});

bot.command("find", async (ctx) => {
  if (!allowed(ctx.chat.id)) return;
  const locale = await Effect.runPromise(database.chatLocale(ctx.chat.id));
  const query = ctx.match.trim();
  const view = await findView(locale, query, ctx.chat.id);
  await ctx.reply(view.text, {
    parse_mode: "HTML",
    reply_markup: view.keyboard,
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
    const locale = await Effect.runPromise(database.chatLocale(chat.id));
    await ctx.answerCallbackQuery();
    await ctx.deleteMessage();
    await ctx.reply(await exactFindReplyText(locale, action.plate, chat.id), {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
    return;
  }
  if (action.kind === "search") {
    const locale = await Effect.runPromise(database.chatLocale(chat.id));
    const view = await findView(locale, action.query, chat.id, action.page);
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(view.text, {
      parse_mode: "HTML",
      reply_markup: view.keyboard,
      link_preview_options: { is_disabled: true },
    });
    return;
  }

  const locale = await Effect.runPromise(database.chatLocale(chat.id));
  const view = await listView(locale, chat.id, action.page);
  await ctx.answerCallbackQuery();
  if (!view) {
    await ctx.editMessageText(messages(locale).noIndexedCars);
    return;
  }
  await ctx.editMessageText(view.text, { reply_markup: view.keyboard });
});

await bot.api.setMyCommands(groupCommands(DEFAULT_LOCALE), { scope: { type: "all_group_chats" } });
await bot.api.setMyCommands(groupCommands("uk"), { scope: { type: "all_group_chats" }, language_code: "uk" });
console.info(`Bot is running; photo recognition pipeline=detector-fast-ocr reader=${activeReader}`);
await runLongPolling(bot);

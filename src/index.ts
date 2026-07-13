import "dotenv/config";
import { Bot, InlineKeyboard } from "grammy";
import { Effect } from "effect";
import { groupCommands } from "./commands.js";
import { clampPage, findCallbackData, listCallbackData, LIST_PAGE_SIZE, pageCount, parseListCallback } from "./car-list.js";
import { SqliteIndexStore } from "./database.js";
import { formatFindResult } from "./find-results.js";
import { OllamaVisionAnalyzer } from "./ollama-vision.js";
import { normalizePlate } from "./plates.js";
import { processPhotoRecognition, type RecognitionMode } from "./photo-recognition.js";
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
const recognitionMode: RecognitionMode = recognitionModeValue;
const ollamaModel = process.env.OLLAMA_MODEL ?? "gemma4:latest";
const ollamaBaseUrl = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
const ollamaTimeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS ?? "60000");
if (!Number.isSafeInteger(ollamaTimeoutMs) || ollamaTimeoutMs < 1) {
  throw new Error("OLLAMA_TIMEOUT_MS must be a positive integer");
}

const database = new SqliteIndexStore(process.env.DATABASE_PATH ?? "./data/index.db");
const bot = new Bot(token);
const photoQueue = new SerialQueue();
const visionAnalyzer = new OllamaVisionAnalyzer({
  baseUrl: ollamaBaseUrl,
  model: ollamaModel,
  timeoutMs: ollamaTimeoutMs,
});

const allowed = (chatId: number): boolean => allowedChats.has(String(chatId));

const chatUsername = (chat: { username?: string }): string | undefined => chat.username;

const findReplyText = async (plate: string, chatId: number): Promise<string> => {
  const results = await Effect.runPromise(database.find(plate, chatId));
  if (results.length === 0) return `Для ${plate} нічого не знайдено.`;
  const links = results.map((result, index) => formatFindResult(result, index + 1));
  return `Знайдено ${results.length} повідомлень для ${plate}:\n${links.join("\n")}`;
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
  await ctx.reply("Готово. Надішли фото авто — бот спробує розпізнати ДНЗ.\nПошук: /find AA1234BB · Список: /list");
});

bot.on("message:photo", (ctx) => {
  if (!allowed(ctx.chat.id)) return;
  const largestPhoto = ctx.message.photo.at(-1);
  if (!largestPhoto) return;

  void photoQueue.enqueue(async () => {
    const plates = await processPhotoRecognition({
      store: database,
      download: downloadPhoto,
      analyze: visionAnalyzer.analyze,
      mode: recognitionMode,
    }, {
      chatId: ctx.chat.id,
      messageId: ctx.message.message_id,
      fileId: largestPhoto.file_id,
      chatUsername: chatUsername(ctx.chat),
      mediaGroupId: ctx.message.media_group_id,
    });
    console.info(
      `photo recognition chat=${ctx.chat.id} message=${ctx.message.message_id}`
      + ` candidates=${plates.length} mode=${recognitionMode}`,
    );
  }).catch((error: unknown) => {
    console.error(
      `photo recognition failed chat=${ctx.chat.id} message=${ctx.message.message_id}`,
      error instanceof Error ? error.message : String(error),
    );
  });
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
  const plate = normalizePlate(ctx.match);
  if (!plate) {
    await ctx.reply("Формат: /find AA1234BB");
    return;
  }
  await ctx.reply(await findReplyText(plate, ctx.chat.id), {
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
    const plate = normalizePlate(action.plate);
    await ctx.answerCallbackQuery();
    if (!plate) return;
    await ctx.deleteMessage();
    await ctx.reply(await findReplyText(plate, chat.id), {
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
console.info(`Bot is running; photo recognition mode=${recognitionMode} model=${ollamaModel}`);
await runLongPolling(bot);

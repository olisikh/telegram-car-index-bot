import "dotenv/config";
import { Bot, InlineKeyboard } from "grammy";
import { Effect } from "effect";
import { groupCommands } from "./commands.js";
import { carCommandPlate } from "./car-command.js";
import { clampPage, findCallbackData, listCallbackData, LIST_PAGE_SIZE, pageCount, parseListCallback } from "./car-list.js";
import { indexCarMessage } from "./car-indexing.js";
import { SqliteIndexStore } from "./database.js";
import { formatFindResult } from "./find-results.js";
import { mediaTypeFromMessage } from "./message-media-type.js";
import { normalizePlate } from "./plates.js";
import { runLongPolling } from "./polling.js";
import { indexTaggedMediaReply } from "./tagged-photo.js";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required");

const allowedChats = new Set((process.env.ALLOWED_CHAT_IDS ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean));

if (allowedChats.size === 0) {
  throw new Error("ALLOWED_CHAT_IDS is required to prevent indexing unauthorised chats");
}

const database = new SqliteIndexStore(process.env.DATABASE_PATH ?? "./data/index.db");
const bot = new Bot(token);

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

// Receipt telemetry: contains no message text or image data, only update shape.
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
  await ctx.reply("Готово. Надішли /car AA1234BB як повідомлення або підпис до фото чи відео.\nПошук: /find AA1234BB · Список: /list");
});

bot.on(["message:photo", "message:video", "message:animation", "message:document"], async (ctx) => {
  if (!allowed(ctx.chat.id)) return;
  const mediaType = mediaTypeFromMessage(ctx.message);
  if (!mediaType) return;
  const mediaGroupId = ctx.message.media_group_id;
  if (mediaGroupId) {
    await Effect.runPromise(database.recordMediaGroupMember({
      chatId: ctx.chat.id,
      mediaGroupId,
      messageId: ctx.message.message_id,
      mediaType,
    }));
  }
  if (!ctx.message.caption) return;
  const plate = carCommandPlate(ctx.message.caption);
  if (!plate) return;

  await Effect.runPromise(indexCarMessage(database, {
    chatId: ctx.chat.id,
    messageId: ctx.message.message_id,
    chatUsername: chatUsername(ctx.chat),
    text: ctx.message.caption,
    mediaType,
    mediaGroupId,
  }));
  await ctx.reply(`✅ Збережено ${plate}`);
});

bot.on("message:text", async (ctx, next) => {
  if (allowed(ctx.chat.id)) {
    const repliedMessage = ctx.message.reply_to_message;
    const mediaType = repliedMessage && ("photo" in repliedMessage ? "photo" : "video" in repliedMessage ? "video" : undefined);
    if (repliedMessage && mediaType) {
      const mediaGroupId = repliedMessage.media_group_id;
      if (mediaGroupId) {
        await Effect.runPromise(database.recordMediaGroupMember({
          chatId: ctx.chat.id,
          mediaGroupId,
          messageId: repliedMessage.message_id,
          mediaType,
        }));
      }
      await Effect.runPromise(indexTaggedMediaReply(database, {
        chatId: ctx.chat.id,
        mediaMessageId: repliedMessage.message_id,
        chatUsername: chatUsername(ctx.chat),
        text: ctx.message.text,
        mediaType,
        mediaGroupId,
      }));
    }
  }
  await next();
});

bot.command("car", async (ctx) => {
  if (!allowed(ctx.chat.id)) return;
  const message = ctx.message;
  if (!message?.text) return;
  const plate = carCommandPlate(message.text);
  if (!plate) {
    await ctx.reply("Формат: /car AA1234BB");
    return;
  }

  await Effect.runPromise(indexCarMessage(database, {
    chatId: ctx.chat.id,
    messageId: message.message_id,
    chatUsername: chatUsername(ctx.chat),
    text: message.text,
  }));
  await ctx.reply(`✅ Збережено ${plate}`);
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
console.info("Bot is running");
await runLongPolling(bot);

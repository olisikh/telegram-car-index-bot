import "dotenv/config";
import { Bot } from "grammy";
import { Effect } from "effect";
import { groupCommands } from "./commands.js";
import { carCommandPlate } from "./car-command.js";
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
  await ctx.reply("Готово. Надішли /car AA1234BB як повідомлення або підпис до фото чи відео.\nПошук: /find AA1234BB");
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

bot.command("find", async (ctx) => {
  if (!allowed(ctx.chat.id)) return;
  const plate = normalizePlate(ctx.match);
  if (!plate) {
    await ctx.reply("Формат: /find AA1234BB");
    return;
  }

  const results = await Effect.runPromise(database.find(plate, ctx.chat.id));
  if (results.length === 0) {
    await ctx.reply(`Для ${plate} нічого не знайдено.`);
    return;
  }

  const links = results.map((result, index) => formatFindResult(result, index + 1));
  await ctx.reply(`Знайдено ${results.length} повідомлень для ${plate}:\n${links.join("\n")}`, {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  });
});

await bot.api.setMyCommands(groupCommands, { scope: { type: "all_group_chats" } });
console.info("Bot is running");
await runLongPolling(bot);

import "dotenv/config";
import { Bot } from "grammy";
import { Effect } from "effect";
import { groupCommands } from "./commands.js";
import { SqliteIndexStore } from "./database.js";
import { indexPhotoMessage } from "./indexing.js";
import { normalizePlate } from "./plates.js";
import { runLongPolling } from "./polling.js";
import { indexTaggedPhotoReply } from "./tagged-photo.js";

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

bot.command("start", async (ctx) => {
  if (!allowed(ctx.chat.id)) return;
  await ctx.reply("Готово. Додай #AA1234BB у підпис до фото або надішли його відповіддю на фото.\nПошук: /find AA1234BB");
});

bot.on("message:photo", async (ctx) => {
  if (!allowed(ctx.chat.id) || !ctx.message.caption) return;
  await Effect.runPromise(indexPhotoMessage(database, {
    chatId: ctx.chat.id,
    messageId: ctx.message.message_id,
    chatUsername: chatUsername(ctx.chat),
    caption: ctx.message.caption,
  }));
});

bot.on("message:text", async (ctx) => {
  if (!allowed(ctx.chat.id)) return;
  const photo = ctx.message.reply_to_message;
  if (!photo?.photo) return;

  await Effect.runPromise(indexTaggedPhotoReply(database, {
    chatId: ctx.chat.id,
    photoMessageId: photo.message_id,
    chatUsername: chatUsername(ctx.chat),
    text: ctx.message.text,
  }));
});

bot.command("find", async (ctx) => {
  if (!allowed(ctx.chat.id)) return;
  const plate = normalizePlate(ctx.match);
  if (!plate) {
    await ctx.reply("Формат: /find AA1234BB");
    return;
  }

  const results = await Effect.runPromise(database.find(plate));
  if (results.length === 0) {
    await ctx.reply(`Для ${plate} нічого не знайдено.`);
    return;
  }

  const links = results.map((result, index) => `${index + 1}. ${result.messageUrl}`);
  await ctx.reply(`Знайдено ${results.length} повідомлень для ${plate}:\n${links.join("\n")}`, {
    link_preview_options: { is_disabled: true },
  });
});

await bot.api.setMyCommands(groupCommands, { scope: { type: "all_group_chats" } });
console.info("Bot is running");
await runLongPolling(bot);

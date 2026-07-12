import "dotenv/config";
import { Bot } from "grammy";
import { Effect } from "effect";
import { groupCommands } from "./commands.js";
import { carCommandPlate } from "./car-command.js";
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

// Receipt telemetry: contains no message text or image data, only update shape.
bot.use(async (ctx, next) => {
  const message = ctx.update.message;
  if (message) {
    console.info(
      `received chat=${message.chat.id} message=${message.message_id}`
      + ` photo=${"photo" in message} caption=${"caption" in message}`
      + ` text=${"text" in message} reply=${message.reply_to_message?.message_id ?? "-"}`,
    );
  }
  await next();
});

bot.command("start", async (ctx) => {
  if (!allowed(ctx.chat.id)) return;
  await ctx.reply("Готово. Для надійної індексації: фото з підписом /car AA1234BB.\nПошук: /find AA1234BB");
});

bot.on("message:photo", async (ctx) => {
  if (!allowed(ctx.chat.id) || !ctx.message.caption) return;
  const commandPlate = carCommandPlate(ctx.message.caption);
  await Effect.runPromise(indexPhotoMessage(database, {
    chatId: ctx.chat.id,
    messageId: ctx.message.message_id,
    chatUsername: chatUsername(ctx.chat),
    caption: ctx.message.caption,
  }));
  if (commandPlate) await ctx.reply(`✅ Збережено ${commandPlate}`);
});

bot.on("message:text", async (ctx, next) => {
  if (allowed(ctx.chat.id)) {
    const repliedMessage = ctx.message.reply_to_message;
    if (repliedMessage) {
      await Effect.runPromise(indexTaggedPhotoReply(database, {
        chatId: ctx.chat.id,
        photoMessageId: repliedMessage.message_id,
        chatUsername: chatUsername(ctx.chat),
        text: ctx.message.text,
      }));
    }
  }
  await next();
});

bot.command("car", async (ctx) => {
  if (!allowed(ctx.chat.id)) return;
  await ctx.reply("Надішли фото з підписом: /car AA1234BB");
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

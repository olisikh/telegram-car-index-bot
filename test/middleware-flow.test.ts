import { Bot } from "grammy";
import { describe, expect, it } from "vitest";

describe("text indexing middleware", () => {
  it("passes command messages to subsequent command handlers", async () => {
    const bot = new Bot("test-token", {
      botInfo: {
        id: 1, is_bot: true, first_name: "test", username: "test",
        can_join_groups: true, can_read_all_group_messages: true,
        supports_inline_queries: false, can_connect_to_business: false,
        has_main_web_app: false,
      } as never,
    });
    let commandHandled = false;

    bot.on("message:text", async (_ctx, next) => { await next(); });
    bot.command("find", () => { commandHandled = true; });

    await bot.handleUpdate({
      update_id: 1,
      message: {
        message_id: 1,
        date: 0,
        chat: { id: -1001, type: "supergroup", title: "test" },
        from: { id: 2, is_bot: false, first_name: "tester" },
        text: "/find AA1234BB",
        entities: [{ offset: 0, length: 5, type: "bot_command" }],
      },
    });

    expect(commandHandled).toBe(true);
  });
});

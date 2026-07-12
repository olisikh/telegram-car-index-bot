import type { Bot } from "grammy";

interface TelegramUpdateId {
  readonly update_id: number;
}

export const nextOffset = (
  currentOffset: number,
  updates: ReadonlyArray<TelegramUpdateId>,
): number => updates.reduce((offset, update) => Math.max(offset, update.update_id + 1), currentOffset);

/**
 * A single explicit getUpdates loop. It keeps exactly one long-poll request
 * active, which avoids hidden polling lifecycle conflicts.
 */
export const runLongPolling = async (bot: Bot): Promise<never> => {
  await bot.init();
  await bot.api.deleteWebhook({ drop_pending_updates: false });

  let offset = 0;
  for (;;) {
    const updates = await bot.api.getUpdates({
      offset,
      timeout: 20,
      allowed_updates: ["message"],
    });

    for (const update of updates) {
      offset = nextOffset(offset, [update]);
      try {
        await bot.handleUpdate(update);
      } catch (error) {
        console.error("Telegram update failed", error);
      }
    }
  }
};

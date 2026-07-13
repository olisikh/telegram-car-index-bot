import { describe, expect, it, vi } from "vitest";
import { allowedUpdates, nextOffset, runLongPolling } from "../src/polling.js";

describe("nextOffset", () => {
  it("requests message and callback-query updates", () => {
    expect(allowedUpdates).toEqual(["message", "callback_query"]);
  });

  it("advances beyond the highest processed update", () => {
    expect(nextOffset(1, [{ update_id: 7 }, { update_id: 9 }])).toBe(10);
  });

  it("does not advance when no updates arrive", () => {
    expect(nextOffset(10, [])).toBe(10);
  });

  it("does not request another Telegram batch until the active update completes", async () => {
    let releaseUpdate: (() => void) | undefined;
    const firstUpdate = { update_id: 1 };
    const getUpdates = vi.fn()
      .mockResolvedValueOnce([firstUpdate])
      .mockRejectedValueOnce(new Error("stop test loop"));
    const bot = {
      init: vi.fn().mockResolvedValue(undefined),
      api: {
        deleteWebhook: vi.fn().mockResolvedValue(true),
        getUpdates,
      },
      handleUpdate: vi.fn().mockImplementation(async () => new Promise<void>((resolve) => {
        releaseUpdate = resolve;
      })),
    };

    const poller = runLongPolling(bot as never);
    await vi.waitFor(() => expect(bot.handleUpdate).toHaveBeenCalledWith(firstUpdate));
    expect(getUpdates).toHaveBeenCalledTimes(1);

    releaseUpdate?.();
    await expect(poller).rejects.toThrow("stop test loop");
    expect(getUpdates).toHaveBeenCalledTimes(2);
  });
});

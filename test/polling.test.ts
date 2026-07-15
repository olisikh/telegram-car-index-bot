import { describe, expect, it, mock } from "bun:test";
import { allowedUpdates, nextOffset, runLongPolling } from "../src/polling";

const waitFor = async (assertion: () => void, timeout = 1000): Promise<void> => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      assertion();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  assertion();
};

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
    const getUpdates = mock()
      .mockResolvedValueOnce([firstUpdate])
      .mockRejectedValueOnce(new Error("stop test loop"));
    const bot = {
      init: mock().mockResolvedValue(undefined),
      api: {
        deleteWebhook: mock().mockResolvedValue(true),
        getUpdates,
      },
      handleUpdate: mock().mockImplementation(async () => new Promise<void>((resolve) => {
        releaseUpdate = resolve;
      })),
    };

    const poller = runLongPolling(bot as never);
    await waitFor(() => expect(bot.handleUpdate).toHaveBeenCalledWith(firstUpdate));
    expect(getUpdates).toHaveBeenCalledTimes(1);

    releaseUpdate?.();
    await expect(poller).rejects.toThrow("stop test loop");
    expect(getUpdates).toHaveBeenCalledTimes(2);
  });
});

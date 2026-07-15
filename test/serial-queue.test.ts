import { describe, expect, it } from "bun:test";
import { SerialQueue } from "../src/serial-queue";

describe("SerialQueue", () => {
  it("runs jobs one at a time in submission order", async () => {
    const queue = new SerialQueue();
    const events: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const first = queue.enqueue(async () => {
      events.push("first:start");
      await new Promise<void>((resolve) => { releaseFirst = resolve; });
      events.push("first:end");
    });
    const second = queue.enqueue(async () => { events.push("second"); });

    await Promise.resolve();
    expect(events).toEqual(["first:start"]);
    releaseFirst?.();
    await Promise.all([first, second]);
    expect(events).toEqual(["first:start", "first:end", "second"]);
  });

  it("continues with later jobs after a failed job", async () => {
    const queue = new SerialQueue();
    const second = queue.enqueue(async () => { throw new Error("failed"); });
    const third = queue.enqueue(async () => "processed");

    await expect(second).rejects.toThrow("failed");
    await expect(third).resolves.toBe("processed");
  });
});

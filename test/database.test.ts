import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { SqliteIndexStore } from "../src/database.js";

describe("SqliteIndexStore", () => {
  it("keeps every plate indexed from one photo", async () => {
    const store = new SqliteIndexStore(":memory:");
    await Effect.runPromise(store.save({ plate: "AA1234BB", messageUrl: "https://t.me/c/1/42" }));
    await Effect.runPromise(store.save({ plate: "KA0001AX", messageUrl: "https://t.me/c/1/42" }));

    await expect(Effect.runPromise(store.find("AA1234BB"))).resolves.toHaveLength(1);
    await expect(Effect.runPromise(store.find("KA0001AX"))).resolves.toHaveLength(1);
    store.close();
  });

  it("creates the directory for a file-backed index", () => {
    const directory = mkdtempSync(join(tmpdir(), "car-index-"));
    const path = join(directory, "nested", "index.db");
    const store = new SqliteIndexStore(path);
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
});

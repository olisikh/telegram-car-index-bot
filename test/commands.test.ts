import { describe, expect, it } from "vitest";
import { groupCommands } from "../src/commands.js";

describe("groupCommands", () => {
  it("advertises the supported group commands", () => {
    expect(groupCommands).toEqual([
      { command: "start", description: "Показати інструкцію" },
      { command: "find", description: "Знайти фото за ДНЗ" },
      { command: "list", description: "Список авто" },
      { command: "car", description: "Індексувати фото за ДНЗ" },
    ]);
  });
});

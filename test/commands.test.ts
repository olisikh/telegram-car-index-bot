import { describe, expect, it } from "vitest";
import { groupCommands } from "../src/commands.js";

describe("groupCommands", () => {
  it("advertises English commands by default", () => {
    expect(groupCommands("en")).toEqual([
      { command: "start", description: "Show instructions" },
      { command: "find", description: "Find photos by plate" },
      { command: "list", description: "List indexed cars" },
      { command: "verbose", description: "Photo recognition status" },
      { command: "lang", description: "Set language: en or uk" },
    ]);
  });

  it("advertises Ukrainian commands", () => {
    expect(groupCommands("uk")).toEqual([
      { command: "start", description: "Показати інструкцію" },
      { command: "find", description: "Знайти фото за ДНЗ" },
      { command: "list", description: "Список авто" },
      { command: "verbose", description: "Статус розпізнавання фото" },
      { command: "lang", description: "Обрати мову: en або uk" },
    ]);
  });
});

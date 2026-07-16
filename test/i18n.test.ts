import { describe, expect, it } from "bun:test";
import { DEFAULT_LOCALE, messages, parseLocale } from "../src/i18n";

describe("i18n", () => {
  it("uses English by default and parses supported two-letter language codes", () => {
    expect(DEFAULT_LOCALE).toBe("en");
    expect(parseLocale("en")).toBe("en");
    expect(parseLocale("EN")).toBe("en");
    expect(parseLocale("uk")).toBe("uk");
    expect(parseLocale("ua")).toBe("uk");
    expect(parseLocale("fr")).toBeUndefined();
    expect(parseLocale("english")).toBeUndefined();
  });

  it("provides complete English and Ukrainian messages", () => {
    expect(messages("en").start).toContain("Send a car photo");
    expect(messages("uk").start).toContain("Надішліть фото авто");
    expect(messages("en").start).toContain("/collect off");
    expect(messages("uk").start).toContain("/collect off");
    expect(messages("en").nothingFound("AA1234BB")).toBe("Nothing found for AA1234BB.");
    expect(messages("uk").nothingFound("AA1234BB")).toBe("Для AA1234BB нічого не знайдено.");
    expect(messages("en").languageChanged).toBe("Language changed to English.");
    expect(messages("uk").languageChanged).toBe("Мову змінено на українську.");
  });
});

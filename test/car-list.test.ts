import { describe, expect, it } from "vitest";
import {
  clampPage,
  findCallbackData,
  listCallbackData,
  LIST_PAGE_SIZE,
  pageCount,
  parseListCallback,
  searchCallbackData,
} from "../src/car-list.js";

describe("car list pagination", () => {
  it("uses ten cars per page", () => {
    expect(LIST_PAGE_SIZE).toBe(10);
    expect(pageCount(0)).toBe(1);
    expect(pageCount(10)).toBe(1);
    expect(pageCount(11)).toBe(2);
  });

  it("keeps a requested page within the available range", () => {
    expect(clampPage(-1, 12)).toBe(0);
    expect(clampPage(1, 12)).toBe(1);
    expect(clampPage(99, 12)).toBe(1);
  });

  it("encodes and parses compact callback actions", () => {
    expect(listCallbackData(3)).toBe("list:3");
    expect(findCallbackData("AA1234BB")).toBe("find:AA1234BB");
    expect(searchCallbackData("809", 2)).toBe("search:809:2");
    expect(parseListCallback("list:3")).toEqual({ kind: "list", page: 3 });
    expect(parseListCallback("find:AA1234BB")).toEqual({ kind: "find", plate: "AA1234BB" });
    expect(parseListCallback("search:809:2")).toEqual({ kind: "search", query: "809", page: 2 });
    expect(parseListCallback("oops")).toBeUndefined();
  });
});

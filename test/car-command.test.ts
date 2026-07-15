import { describe, expect, it } from "bun:test";
import { carCommandPlate } from "../src/car-command";

describe("carCommandPlate", () => {
  it("uses the first word after /car as the plate and ignores the remaining message", () => {
    expect(carCommandPlate("/car АА1234ВВ maintenance complete")).toBe("AA1234BB");
  });

  it("does not treat an ordinary caption as a /car command", () => {
    expect(carCommandPlate("#AA1234BB")).toBeUndefined();
  });
});

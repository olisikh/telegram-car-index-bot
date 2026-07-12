import { describe, expect, it } from "vitest";
import { carCommandPlate } from "../src/car-command.js";

describe("carCommandPlate", () => {
  it("reads a Ukrainian plate from a /car photo caption", () => {
    expect(carCommandPlate("/car АА 1234 ВВ")).toBe("AA1234BB");
  });

  it("does not treat an ordinary caption as a /car command", () => {
    expect(carCommandPlate("#AA1234BB")).toBeUndefined();
  });
});

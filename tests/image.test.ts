import { describe, expect, it } from "vitest";
import { colorsToLight } from "../src/image";

// Un píxel RGB -> el gris que queda tras la conversión
function convert(r: number, g: number, b: number): number {
  const data = new Uint8ClampedArray([r, g, b, 255]);
  colorsToLight(data);
  expect(data[0]).toBe(data[1]);
  expect(data[1]).toBe(data[2]);
  return data[0];
}

describe("colorsToLight", () => {
  it("los fondos de color quedan claros", () => {
    expect(convert(21, 101, 192)).toBe(255); // azul
    expect(convert(13, 71, 161)).toBe(255); // azul oscuro
    expect(convert(27, 94, 32)).toBe(161); // verde oscuro
    expect(convert(46, 125, 50)).toBe(204); // verde
    expect(convert(183, 28, 28)).toBe(255); // rojo oscuro
    expect(convert(250, 250, 250)).toBe(250); // blanco
  });

  it("las barras negras y los grises no cambian de brillo", () => {
    expect(convert(25, 25, 30)).toBe(35);
    expect(convert(0, 0, 0)).toBe(0);
    expect(convert(128, 128, 128)).toBe(128);
  });

  it("procesa todos los píxeles y no toca la transparencia", () => {
    const data = new Uint8ClampedArray([10, 20, 30, 128, 0, 0, 0, 77]);
    colorsToLight(data);
    expect(Array.from(data)).toEqual([50, 50, 50, 128, 0, 0, 0, 77]);
  });
});

describe("colorsToLight con fuerza 2", () => {
  it("aclara más los colores oscuros y deja igual el negro y el gris", () => {
    const data = new Uint8ClampedArray([27, 94, 32, 255, 25, 25, 25, 255, 128, 128, 128, 255]);
    colorsToLight(data, 2);
    expect([data[0], data[4], data[8]]).toEqual([228, 25, 128]);
  });
});

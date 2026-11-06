import { describe, expect, it } from "vitest";
import { colorsToLight } from "../src/image";

type RGB = [number, number, number];

// Un píxel RGB -> el gris que queda tras la conversión
function convert([r, g, b]: RGB, strength = 1): number {
  const data = new Uint8ClampedArray([r, g, b, 255]);
  colorsToLight(data, strength);
  expect(data[0]).toBe(data[1]);
  expect(data[1]).toBe(data[2]);
  return data[0];
}

// Gris "normal" (el que usan los lectores), para comparar
const plainGray = ([r, g, b]: RGB) => 0.299 * r + 0.587 * g + 0.114 * b;

const BAR: RGB = [25, 25, 30]; // barra negra
const BACKGROUNDS: Record<string, RGB> = {
  azul: [21, 101, 192],
  azulOscuro: [13, 71, 161],
  verdeOscuro: [27, 94, 32],
  rojoOscuro: [183, 28, 28],
  rojoVivo: [229, 57, 53],
};

describe("colorsToLight", () => {
  it.each(Object.entries(BACKGROUNDS))("%s: fondo y barras se distinguen mucho mejor que en gris normal", (_name, bg) => {
    for (const strength of [1, 2]) {
      const contrastNew = convert(bg, strength) / convert(BAR, strength);
      const contrastOld = plainGray(bg) / plainGray(BAR);
      expect(contrastNew).toBeGreaterThan(contrastOld * 1.5);
    }
  });

  it("es casi lineal: un borde borroso (mitad barra, mitad fondo) queda cerca de la mitad", () => {
    // Si se recortara a 255, este borde quedaría a más de 100 puntos de la mitad (casi blanco)
    // y las barras "adelgazarían". No es exacto porque barra y fondo no tienen el mismo canal mínimo.
    const bg = BACKGROUNDS.rojoVivo;
    const edge: RGB = [0, 1, 2].map((i) => (bg[i] + BAR[i]) / 2) as RGB;
    for (const strength of [1, 2]) {
      const middle = (convert(bg, strength) + convert(BAR, strength)) / 2;
      expect(Math.abs(convert(edge, strength) - middle)).toBeLessThanOrEqual(6);
    }
  });

  it("nunca se sale de 0–255, ni con el color más vivo", () => {
    expect(convert([255, 0, 0], 2)).toBe(255);
    expect(convert([0, 0, 0], 2)).toBe(0);
  });

  it("con fuerza 2 el verde oscuro destaca más frente al papel blanco", () => {
    const ratio = (s: number) => convert(BACKGROUNDS.verdeOscuro, s) / convert([245, 245, 245], s);
    expect(ratio(2)).toBeGreaterThan(ratio(1));
  });

  it("procesa todos los píxeles y no toca la transparencia", () => {
    const data = new Uint8ClampedArray([10, 20, 30, 128, 0, 0, 0, 77]);
    colorsToLight(data);
    expect(Array.from(data)).toEqual([25, 25, 25, 128, 0, 0, 0, 77]);
  });
});

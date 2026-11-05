import { describe, expect, it } from "vitest";
import { coverTransform } from "../src/overlay";

describe("coverTransform", () => {
  it("vídeo horizontal en pantalla vertical: escala por la altura y recorta los lados", () => {
    // Vídeo 1920×1080 en un móvil de 390×844
    const t = coverTransform(1920, 1080, 390, 844);
    expect(t.scale).toBeCloseTo(844 / 1080);
    expect(t.offsetY).toBeCloseTo(0);
    expect(t.offsetX).toBeCloseTo((390 - 1920 * (844 / 1080)) / 2); // negativo: lados recortados
    // El centro del vídeo cae en el centro de la pantalla
    expect(960 * t.scale + t.offsetX).toBeCloseTo(195);
  });

  it("vídeo vertical en pantalla vertical más alargada: escala por la altura", () => {
    const t = coverTransform(1080, 1920, 390, 844);
    expect(t.scale).toBeCloseTo(844 / 1920);
    expect(540 * t.scale + t.offsetX).toBeCloseTo(195);
    expect(t.offsetY).toBeCloseTo(0);
  });

  it("misma proporción: sin recorte", () => {
    const t = coverTransform(1920, 1080, 960, 540);
    expect(t).toEqual({ scale: 0.5, offsetX: 0, offsetY: 0 });
  });
});

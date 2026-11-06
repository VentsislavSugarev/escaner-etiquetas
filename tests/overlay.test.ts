import { describe, expect, it } from "vitest";
import { coverTransform, visibleRegion } from "../src/overlay";

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

describe("visibleRegion", () => {
  it("vídeo horizontal en móvil vertical: solo la franja central", () => {
    // 1920×1080 en 390×844: se ve una franja de ~499 px de ancho en el centro
    const r = visibleRegion(1920, 1080, 390, 844);
    expect(r.y).toBe(0);
    expect(r.height).toBe(1080);
    expect(r.width).toBe(Math.ceil(390 / (844 / 1080)));
    expect(r.x + r.width / 2).toBeCloseTo(960, 0); // centrada
  });

  it("vídeo vertical en móvil vertical: recorta un poco los lados", () => {
    const r = visibleRegion(1080, 1920, 390, 844);
    expect(r.y).toBe(0);
    expect(r.height).toBe(1920);
    expect(r.width).toBeLessThan(1080);
    expect(r.x + r.width / 2).toBeCloseTo(540, 0);
  });

  it("misma proporción: todo el vídeo", () => {
    expect(visibleRegion(1920, 1080, 960, 540)).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
  });

  it("sin la parte tapada por la tarjeta (arriba) y el contador (abajo)", () => {
    // 1080×1920 en 390×844: escala 844/1920; la franja libre va de 120 a 670 px de pantalla
    const r = visibleRegion(1080, 1920, 390, 844, 120, 670);
    expect(r.y).toBe(Math.floor(120 / (844 / 1920)));
    expect(r.y + r.height).toBe(Math.ceil(670 / (844 / 1920)));
  });

  it("nunca se sale del vídeo", () => {
    const cases = [
      [1280, 720, 375, 812, 0, 812],
      [640, 480, 1024, 768, 0, 768],
      [1080, 1920, 430, 932, 150, 700],
      [1080, 1920, 430, 932, 900, 100], // paneles que lo tapan todo: sigue siendo válido
    ];
    for (const [vw, vh, sw, sh, top, bottom] of cases) {
      const r = visibleRegion(vw, vh, sw, sh, top, bottom);
      expect(r.height).toBeGreaterThanOrEqual(1);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(vw);
      expect(r.y + r.height).toBeLessThanOrEqual(vh);
    }
  });
});

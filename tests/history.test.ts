import { describe, expect, it } from "vitest";
import { toCsv } from "../src/history";

describe("toCsv", () => {
  it("genera cabecera y una fila por producto separadas por ;", () => {
    const csv = toCsv([
      { date: "2026-11-05T10:00:00.000Z", code: "87202458470870003", ean: "8720245847087", packs: 3 },
      { date: "2026-11-05T10:05:00.000Z", code: "87202457693890006", ean: "8720245769389", packs: 6 },
    ]);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe("fecha;codigo_producto;ean_pegatina;packs");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toMatch(/;87202458470870003;8720245847087;3$/);
    expect(lines[2]).toMatch(/;87202457693890006;8720245769389;6$/);
  });

  it("historial vacío: solo cabecera", () => {
    expect(toCsv([])).toBe("fecha;codigo_producto;ean_pegatina;packs\r\n");
  });
});

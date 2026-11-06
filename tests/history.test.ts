import { describe, expect, it } from "vitest";
import { toCsv, withPlaced, type HistoryEntry } from "../src/history";

const A: HistoryEntry = { date: "2026-11-05T10:00:00.000Z", code: "87202458470870003", ean: "8720245847087", packs: 3 };
const B: HistoryEntry = { date: "2026-11-05T10:05:00.000Z", code: "87202457693890006", ean: "8720245769389", packs: 6 };

describe("toCsv", () => {
  it("genera cabecera y una fila por producto separadas por ;", () => {
    const csv = toCsv([{ ...A, placed: 3 }, B]);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe("fecha;codigo_producto;ean_pegatina;packs;pegadas");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toMatch(/;="87202458470870003";="8720245847087";3;3$/);
    expect(lines[2]).toMatch(/;="87202457693890006";="8720245769389";6;$/); // sin dato de pegadas
  });

  it("historial vacío: solo cabecera", () => {
    expect(toCsv([])).toBe("fecha;codigo_producto;ean_pegatina;packs;pegadas\r\n");
  });
});

describe("withPlaced", () => {
  it("apunta las pegadas en la entrada más reciente de ese producto", () => {
    const result = withPlaced([A, B, { ...A, date: "2026-11-05T11:00:00.000Z" }], A.code, 2);
    expect(result[0].placed).toBeUndefined();
    expect(result[1].placed).toBeUndefined();
    expect(result[2].placed).toBe(2);
  });

  it("no modifica la lista original", () => {
    const original = [A];
    withPlaced(original, A.code, 1);
    expect(original[0].placed).toBeUndefined();
  });

  it("si el producto no está, deja la lista igual", () => {
    expect(withPlaced([B], A.code, 1)).toEqual([B]);
  });
});

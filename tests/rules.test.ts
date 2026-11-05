import { describe, expect, it } from "vitest";
import { classify, isValidEan13 } from "../src/rules";

// Casos reales de la tienda: [código del producto, pegatina correcta, packs]
const realCases: [string, string, number][] = [
  ["87212121284370003", "8721212128437", 3],
  ["87202457699070006", "8720245769907", 6],
  ["87202458470870003", "8720245847087", 3],
  ["87202457693890006", "8720245769389", 6],
  ["87202457717950006", "8720245771795", 6],
];

describe("isValidEan13", () => {
  it.each(realCases)("acepta la pegatina de %s", (_product, sticker) => {
    expect(isValidEan13(sticker)).toBe(true);
  });

  it("rechaza un dígito de control incorrecto", () => {
    expect(isValidEan13("8720245847088")).toBe(false);
  });

  it("rechaza longitudes y caracteres no válidos", () => {
    expect(isValidEan13("872024584708")).toBe(false);
    expect(isValidEan13("87202458470870")).toBe(false);
    expect(isValidEan13("872024584708A")).toBe(false);
    expect(isValidEan13("")).toBe(false);
  });
});

describe("classify", () => {
  it.each(realCases)("%s es un producto -> busca %s, %i packs", (product, sticker, packs) => {
    expect(classify(product)).toEqual({ kind: "product", raw: product, ean: sticker, packs });
  });

  it.each(realCases)("la pegatina %s se reconoce como pegatina", (_product, sticker) => {
    expect(classify(sticker)).toEqual({ kind: "sticker", raw: sticker, ean: sticker });
  });

  it("ignora espacios alrededor", () => {
    expect(classify(" 8720245847087\n").kind).toBe("sticker");
  });

  it("17 dígitos con EAN inválido es desconocido", () => {
    expect(classify("87202458470880003")).toEqual({ kind: "unknown", raw: "87202458470880003" });
  });

  it("13 dígitos con control inválido es desconocido", () => {
    expect(classify("8720245847088").kind).toBe("unknown");
  });

  it("otros formatos son desconocidos", () => {
    expect(classify("ABC-123").kind).toBe("unknown");
    expect(classify("12345678").kind).toBe("unknown");
    expect(classify("").kind).toBe("unknown");
  });
});

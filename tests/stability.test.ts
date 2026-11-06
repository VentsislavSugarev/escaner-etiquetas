import { describe, expect, it } from "vitest";
import { StableFilter } from "../src/stability";

describe("StableFilter", () => {
  it("un código visto una sola vez no es de fiar", () => {
    const f = new StableFilter();
    expect(f.push(["A"])).toEqual(new Set());
  });

  it("visto 2 veces seguidas sí", () => {
    const f = new StableFilter();
    f.push(["A"]);
    expect(f.push(["A"])).toEqual(new Set(["A"]));
  });

  it("visto en fotogramas alternos (1 sí, 1 no) también", () => {
    const f = new StableFilter();
    f.push(["A"]);
    f.push([]);
    expect(f.push(["A"])).toEqual(new Set(["A"]));
  });

  it("una lectura falsa aislada nunca pasa aunque las buenas sigan", () => {
    const f = new StableFilter();
    f.push(["A"]);
    f.push(["A", "FALSO"]);
    expect(f.push(["A"])).toEqual(new Set(["A"]));
    expect(f.push(["A"])).toEqual(new Set(["A"]));
  });

  it("olvida lo que se vio hace más de 4 fotogramas", () => {
    const f = new StableFilter();
    f.push(["A"]);
    f.push([]);
    f.push([]);
    f.push([]);
    expect(f.push(["A"])).toEqual(new Set()); // el primer "A" ya salió de la ventana
  });

  it("ya confirmado, basta con verlo una vez de cada varios fotogramas", () => {
    const f = new StableFilter();
    f.push(["A"]);
    expect(f.push(["A"])).toEqual(new Set(["A"])); // confirmado
    for (let i = 0; i < 5; i++) {
      f.push([]);
      f.push([]);
      expect(f.push(["A"])).toEqual(new Set(["A"])); // 1 de cada 3 fotogramas: sigue siendo de fiar
    }
  });

  it("tras más de 4 fotogramas sin verlo, hay que volver a confirmarlo", () => {
    const f = new StableFilter();
    f.push(["A"]);
    f.push(["A"]); // confirmado
    for (let i = 0; i < 5; i++) f.push([]);
    expect(f.push(["A"])).toEqual(new Set()); // necesita 2 lecturas otra vez
    expect(f.push(["A"])).toEqual(new Set(["A"]));
  });

  it("solo devuelve códigos del fotograma actual", () => {
    const f = new StableFilter();
    f.push(["A"]);
    f.push(["A"]);
    expect(f.push(["B"])).toEqual(new Set());
  });
});

// Reglas de negocio. Módulo "puro": no toca la pantalla ni la cámara, solo
// recibe textos y devuelve resultados. Por eso se puede probar con tests.

// Resultado de clasificar un código leído. El campo "kind" dice qué es y,
// según el caso, hay más datos (TypeScript obliga a comprobar "kind" antes de usarlos).
export type Classification =
  | { kind: "product"; raw: string; ean: string; packs: number }
  | { kind: "sticker"; raw: string; ean: string }
  | { kind: "unknown"; raw: string };

// Comprueba el dígito de control de un EAN-13.
// Los 12 primeros dígitos se multiplican alternando por 1 y 3, se suman,
// y el dígito 13 debe ser lo que falta para llegar a la siguiente decena.
export function isValidEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(code[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return check === Number(code[12]);
}

// Decide si un código es de producto (17 dígitos), de pegatina (13) o desconocido.
export function classify(rawInput: string): Classification {
  const raw = rawInput.trim();

  if (/^\d{17}$/.test(raw)) {
    const ean = raw.slice(0, 13); // los 13 primeros = la pegatina que buscamos
    if (isValidEan13(ean)) {
      const packs = Number(raw.slice(13)); // los 4 últimos = nº de pegatinas
      return { kind: "product", raw, ean, packs };
    }
  }

  if (isValidEan13(raw)) {
    return { kind: "sticker", raw, ean: raw };
  }

  return { kind: "unknown", raw };
}

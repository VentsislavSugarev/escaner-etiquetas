// Preparación de la imagen antes de buscar códigos. Puro: se puede probar con tests.

// Las pegatinas tienen las barras negras sobre fondo azul, verde o rojo (a veces blanco).
// Los lectores pasan la imagen a gris, y en gris normal un fondo azul o verde queda
// casi tan oscuro como las barras: no las distinguen.
//
// Aquí cada píxel se convierte en:  canal más brillante + fuerza × saturación  (máx. 255)
//   - un color vivo (azul, verde, rojo) queda claro;
//   - el negro y el gris no tienen saturación, así que no cambian: las barras siguen negras.
// "fuerza" importa: con 2 los verdes oscuros quedan bien claros, pero en azules/rojos
// borrosos el borde de las barras también se aclara. Por eso el lector alterna 1 y 2.
// Medido con 117 pegatinas simuladas (13 colores, distintos papeles y desenfoques):
// gris normal lee 18, fuerza 1 lee 110, fuerza 2 lee 106, y alternando 1 y 2: las 117.
//
// "data" son los píxeles en formato RGBA (4 números por píxel); se modifica en el sitio.
export function colorsToLight(data: Uint8ClampedArray, strength = 1): void {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = r > g ? (r > b ? r : b) : g > b ? g : b;
    const min = r < g ? (r < b ? r : b) : g < b ? g : b;
    // Uint8ClampedArray recorta solo a 255
    data[i] = data[i + 1] = data[i + 2] = max + strength * (max - min);
  }
}

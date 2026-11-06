// Preparación de la imagen antes de buscar códigos. Puro: se puede probar con tests.

// Las pegatinas tienen las barras negras sobre fondo azul, verde o rojo (a veces blanco).
// Los lectores pasan la imagen a gris, y en gris normal un fondo azul o verde queda
// casi tan oscuro como las barras: no las distinguen.
//
// Aquí cada píxel se convierte en:  (canal más brillante + fuerza × saturación) / (1 + fuerza)
//   - un color vivo (azul, verde, rojo) queda claro;
//   - el negro y el gris no tienen saturación: las barras siguen negras.
//   - dividir por (1 + fuerza) hace que nunca pase de 255. Si se recortara a 255, los bordes
//     borrosos de las barras sobre rojo/azul se aclararían, las barras "adelgazarían" y el
//     lector leería números falsos (medido: 4 veces más lecturas falsas).
// "fuerza" importa: con 2 los verdes oscuros destacan más sobre papel blanco; con 1 hay
// menos lecturas falsas. Por eso el lector alterna 1 y 2 en cada fotograma.
// Medido con 117 pegatinas simuladas (13 colores, distintos papeles y desenfoques):
// gris normal lee 18; alternando fuerza 1 y 2, las 117.
//
// "data" son los píxeles en formato RGBA (4 números por píxel); se modifica en el sitio.
export function colorsToLight(data: Uint8ClampedArray, strength = 1): void {
  const divisor = 1 + strength;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = r > g ? (r > b ? r : b) : g > b ? g : b;
    const min = r < g ? (r < b ? r : b) : g < b ? g : b;
    data[i] = data[i + 1] = data[i + 2] = (max + strength * (max - min)) / divisor;
  }
}

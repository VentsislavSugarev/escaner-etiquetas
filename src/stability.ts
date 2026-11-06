// Filtro contra lecturas falsas. Puro: se puede probar con tests.
//
// A veces el lector "inventa" un número mezclando media pegatina con media de la de al lado.
// Esas lecturas falsas suelen salir en un solo fotograma, y las buenas se repiten.
// Así que la primera vez solo damos por bueno un código si se ha visto en al menos
// 2 de los últimos 4 fotogramas (medido: elimina 27 de 31 lecturas falsas y no pierde ninguna buena).
// Son 4 y no 2 seguidos porque el lector alterna dos conversiones de color (ver image.ts)
// y algunas pegatinas solo se leen con una de las dos: aparecen 1 fotograma sí y otro no.
//
// Una vez confirmado, basta con volver a verlo una vez dentro de esos 4 fotogramas para
// seguir dándolo por bueno: así no parpadea una pegatina que el lector lee "a ratos".
export class StableFilter {
  private recent: Set<string>[] = []; // códigos de los últimos fotogramas (el más nuevo al final)
  private lastConfirmed = new Map<string, number>(); // nº del último fotograma en que cada código fue de fiar
  private frameNumber = 0;
  private readonly frames: number;
  private readonly minHits: number;

  constructor(frames = 4, minHits = 2) {
    this.frames = frames;
    this.minHits = minHits;
  }

  // Añade los códigos leídos en un fotograma y devuelve los que ya son de fiar.
  push(values: string[]): Set<string> {
    this.frameNumber++;
    this.recent.push(new Set(values));
    if (this.recent.length > this.frames) this.recent.shift(); // olvida el más antiguo

    const stable = new Set<string>();
    for (const value of values) {
      const hits = this.recent.filter((frame) => frame.has(value)).length;
      const confirmedRecently = (this.lastConfirmed.get(value) ?? -Infinity) >= this.frameNumber - this.frames;
      if (hits >= this.minHits || confirmedRecently) {
        stable.add(value);
        this.lastConfirmed.set(value, this.frameNumber);
      }
    }
    // Olvida los confirmados que hace mucho que no se ven (para que la lista no crezca sin fin)
    for (const [value, frame] of this.lastConfirmed) {
      if (frame < this.frameNumber - this.frames) this.lastConfirmed.delete(value);
    }
    return stable;
  }
}

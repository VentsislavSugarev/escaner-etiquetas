// Lector de códigos. Copia cada fotograma del vídeo y lo manda a un hilo aparte
// (scan.worker.ts), que usa el lector nativo si existe (Android) o zxing (iPhone).

import type { Point, Rect } from "./overlay";

// Un código encontrado en la imagen.
export interface Code {
  format: string; // "code_128", "ean_13"…
  rawValue: string; // el número leído
  cornerPoints: Point[]; // 4 esquinas en píxeles del vídeo
}

export type Engine = "nativo" | "zxing";

export interface Scanner {
  engine: Engine | "…"; // qué motor se usa (se ve en el panel de depuración)
  // Busca códigos solo dentro de "region" (la parte del vídeo que se ve en pantalla).
  detect(video: HTMLVideoElement, region: Rect): Promise<Code[]>;
}

// Mensajes entre este hilo y el worker. "id" numera cada fotograma.
export interface WorkerRequest {
  id: number;
  image: ImageData;
  forceZxing: boolean; // para probar zxing en Android: abre la app con ?motor=zxing
}
export interface WorkerReply {
  id: number;
  engine: Engine;
  codes: Code[];
  error?: string; // p. ej. no se pudo descargar el lector
}

// Si el hilo de lectura no contesta en este tiempo, damos el fotograma por perdido
// (si no, el bucle se quedaría esperando para siempre y la app dejaría de leer).
// Es largo porque la primera vez tiene que descargar el lector (~1 MB) con la red de la tienda.
const TIMEOUT_MS = 10000;

export function createScanner(forceZxing = false): Scanner {
  // Vite empaqueta el worker gracias a "new URL(..., import.meta.url)".
  const worker = new Worker(new URL("./scan.worker.ts", import.meta.url), { type: "module" });
  // Canvas oculto donde copiamos el fotograma para sacar sus píxeles.
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  let lastId = 0;

  const scanner: Scanner = {
    engine: "…",
    // "async": si algo falla aquí mismo (p. ej. al copiar la imagen), se convierte en un error
    // normal que el bucle recoge, en vez de dejarlo parado.
    async detect(video, region) {
      const { x, y, width, height } = region;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      // Copia solo el trozo visible del vídeo
      ctx.drawImage(video, x, y, width, height, 0, 0, width, height);
      const image = ctx.getImageData(0, 0, width, height);
      const id = ++lastId;

      return new Promise<Code[]>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("El lector no responde")), TIMEOUT_MS);
        worker.onerror = (event) => {
          clearTimeout(timer);
          reject(new Error(event.message || "Error en el lector"));
        };
        worker.onmessage = (event: MessageEvent<WorkerReply>) => {
          if (event.data.id !== id) return; // respuesta de un fotograma anterior que llegó tarde
          clearTimeout(timer);
          scanner.engine = event.data.engine;
          if (event.data.error) {
            reject(new Error(event.data.error));
            return;
          }
          // Las esquinas vienen relativas al trozo; las pasamos a coordenadas del vídeo entero.
          const codes = event.data.codes.map((code) => ({
            ...code,
            cornerPoints: code.cornerPoints.map((p) => ({ x: p.x + x, y: p.y + y })),
          }));
          resolve(codes);
        };
        // El 2º parámetro "transfiere" los píxeles al worker en vez de copiarlos (más rápido).
        const request: WorkerRequest = { id, image, forceZxing };
        worker.postMessage(request, [image.data.buffer]);
      });
    },
  };
  return scanner;
}

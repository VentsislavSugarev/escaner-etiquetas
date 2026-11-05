// Lector de códigos. Copia cada fotograma del vídeo y lo manda a un hilo aparte
// (scan.worker.ts), que usa el lector nativo si existe (Android) o zxing (iPhone).

import type { Point } from "./overlay";

// Un código encontrado en la imagen.
export interface Code {
  format: string; // "code_128", "ean_13"…
  rawValue: string; // el número leído
  cornerPoints: Point[]; // 4 esquinas en píxeles del vídeo
}

export type Engine = "nativo" | "zxing";

export interface Scanner {
  engine: Engine | "…"; // qué motor se usa (se ve en el panel de depuración)
  detect(video: HTMLVideoElement): Promise<Code[]>;
}

interface WorkerReply {
  engine: Engine;
  codes: Code[];
}

export function createScanner(): Scanner {
  // Vite empaqueta el worker gracias a "new URL(..., import.meta.url)".
  const worker = new Worker(new URL("./scan.worker.ts", import.meta.url), { type: "module" });
  // Canvas oculto donde copiamos el fotograma para sacar sus píxeles.
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

  const scanner: Scanner = {
    engine: "…",
    detect(video) {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.drawImage(video, 0, 0, w, h);
      const image = ctx.getImageData(0, 0, w, h);

      return new Promise<Code[]>((resolve) => {
        worker.onmessage = (event: MessageEvent<WorkerReply>) => {
          scanner.engine = event.data.engine;
          resolve(event.data.codes);
        };
        // El 2º parámetro "transfiere" los píxeles al worker en vez de copiarlos (más rápido).
        worker.postMessage(image, [image.data.buffer]);
      });
    },
  };
  return scanner;
}

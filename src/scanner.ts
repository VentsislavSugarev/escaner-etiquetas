// Lector de códigos. Usa el lector nativo del navegador si existe (Chrome en Android)
// y si no (iPhone), zxing en un hilo aparte (scan.worker.ts).

import type { Point } from "./overlay";

// Un código encontrado en la imagen.
export interface Code {
  format: string; // "code_128", "ean_13"…
  rawValue: string; // el número leído
  cornerPoints: Point[]; // 4 esquinas en píxeles del vídeo
}

export interface Scanner {
  engine: "nativo" | "zxing"; // qué motor se usa (se ve en el panel de depuración)
  detect(video: HTMLVideoElement): Promise<Code[]>;
}

// El lector nativo no viene en los tipos de TypeScript: describimos lo que usamos.
interface NativeDetector {
  detect(source: HTMLVideoElement): Promise<Code[]>;
}
interface NativeDetectorClass {
  new (options: { formats: string[] }): NativeDetector;
  getSupportedFormats(): Promise<string[]>;
}

const FORMATS = ["code_128", "ean_13", "ean_8", "upc_a", "upc_e"];

export async function createScanner(): Promise<Scanner> {
  const Native = (globalThis as { BarcodeDetector?: NativeDetectorClass }).BarcodeDetector;
  if (Native) {
    try {
      const supported = await Native.getSupportedFormats();
      if (supported.includes("code_128") && supported.includes("ean_13")) {
        const detector = new Native({ formats: FORMATS.filter((f) => supported.includes(f)) });
        return { engine: "nativo", detect: (video) => detector.detect(video) };
      }
    } catch {
      // Si el nativo falla, seguimos con zxing.
    }
  }
  return createZxingScanner();
}

function createZxingScanner(): Scanner {
  // Vite empaqueta el worker gracias a "new URL(..., import.meta.url)".
  const worker = new Worker(new URL("./scan.worker.ts", import.meta.url), { type: "module" });
  // Canvas oculto donde copiamos el fotograma para sacar sus píxeles.
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

  return {
    engine: "zxing",
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
        worker.onmessage = (event: MessageEvent<Code[]>) => resolve(event.data);
        // El 2º parámetro "transfiere" los píxeles al worker en vez de copiarlos (más rápido).
        worker.postMessage(image, [image.data.buffer]);
      });
    },
  };
}

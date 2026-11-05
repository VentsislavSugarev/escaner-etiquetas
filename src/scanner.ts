import {
  BarcodeDetector as ZxingDetector,
  prepareZXingModule,
  type BarcodeFormat,
  type DetectedBarcode,
} from "barcode-detector/ponyfill";
// "?url" hace que Vite copie el .wasm a la web y nos dé su ruta:
// así se carga desde nuestro servidor y no desde internet (funciona sin conexión).
import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";

export type { DetectedBarcode };

// Formatos que buscamos. code_128 = etiqueta del distribuidor, ean_13 = pegatina.
// Los demás están para enterarnos si aparece algún código con otro formato.
const FORMATS: BarcodeFormat[] = ["code_128", "ean_13", "ean_8", "upc_a", "upc_e", "code_39"];

export interface Scanner {
  engine: "nativo" | "zxing"; // qué motor se está usando (para el panel de depuración)
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}

// Usa el lector nativo del navegador si existe y soporta nuestros formatos
// (Chrome en Android); si no (iPhone), usa zxing en WebAssembly.
export async function createScanner(): Promise<Scanner> {
  const Native = (globalThis as { BarcodeDetector?: typeof ZxingDetector }).BarcodeDetector;
  if (Native) {
    try {
      const supported = await Native.getSupportedFormats();
      if (supported.includes("code_128") && supported.includes("ean_13")) {
        const detector = new Native({ formats: FORMATS.filter((f) => supported.includes(f)) });
        return { engine: "nativo", detect: (source) => detector.detect(source) };
      }
    } catch {
      // Si el nativo falla, seguimos con zxing.
    }
  }

  prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? wasmUrl : prefix + path),
    },
    fireImmediately: true, // empieza a descargar el .wasm ya, no al primer escaneo
  });
  const detector = new ZxingDetector({ formats: FORMATS });
  return { engine: "zxing", detect: (source) => detector.detect(source) };
}

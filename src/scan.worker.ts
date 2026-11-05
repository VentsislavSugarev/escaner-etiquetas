// "Worker": código que se ejecuta en un hilo aparte. Aquí se analiza cada imagen
// sin bloquear la pantalla, así los botones y el vídeo siguen fluidos mientras lee.
import { prepareZXingModule, readBarcodes, type ReaderOptions } from "zxing-wasm/reader";
// "?url": Vite copia el .wasm a la web y nos da su ruta (se carga de nuestro servidor, sin internet).
import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";
import { colorsToLight } from "./image";
import type { Code, Engine } from "./scanner";

// ---------- Motor 1: lector nativo (Chrome en Android; también funciona dentro de workers) ----------
interface NativeDetector {
  detect(image: ImageData): Promise<Code[]>;
}
interface NativeDetectorClass {
  new (options: { formats: string[] }): NativeDetector;
  getSupportedFormats(): Promise<string[]>;
}
const NATIVE_FORMATS = ["code_128", "ean_13", "ean_8", "upc_a", "upc_e"];

async function createNative(): Promise<NativeDetector | null> {
  const Native = (self as { BarcodeDetector?: NativeDetectorClass }).BarcodeDetector;
  if (!Native) return null;
  try {
    const supported = await Native.getSupportedFormats();
    if (!supported.includes("code_128") || !supported.includes("ean_13")) return null;
    return new Native({ formats: NATIVE_FORMATS.filter((f) => supported.includes(f)) });
  } catch {
    return null;
  }
}
const nativePromise = createNative();

// ---------- Motor 2: zxing en WebAssembly (iPhone y resto) ----------
prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? wasmUrl : prefix + path),
  },
  fireImmediately: true, // carga el .wasm ya, no al primer escaneo
});

const zxingOptions: ReaderOptions = {
  // code_128 = etiqueta del distribuidor, ean_13 = pegatina; el resto para avisar de formatos raros.
  formats: ["Code128", "EAN13", "EAN8", "UPCA", "UPCE"],
  tryHarder: true, // más preciso con códigos pequeños o borrosos
  tryRotate: true, // también códigos girados 90° (móvil en vertical y tira en horizontal)
  tryInvert: false, // no hay códigos blancos sobre negro: nos ahorramos una pasada entera
  maxNumberOfSymbols: 32,
};

// Nombres de zxing -> los mismos nombres que usa el lector nativo
const FORMAT_NAMES: Record<string, string> = {
  Code128: "code_128",
  EAN13: "ean_13",
  EAN8: "ean_8",
  UPCA: "upc_a",
  UPCE: "upc_e",
};

async function readWithZxing(image: ImageData): Promise<Code[]> {
  const results = await readBarcodes(image, zxingOptions);
  return results
    .filter((r) => r.isValid)
    .map((r) => ({
      format: FORMAT_NAMES[r.format] ?? r.format,
      rawValue: r.text,
      cornerPoints: [r.position.topLeft, r.position.topRight, r.position.bottomRight, r.position.bottomLeft],
    }));
}

// Fuerza de la conversión de color: alterna 1 y 2 en cada fotograma (ver image.ts).
let frame = 0;

// Recibe una imagen del hilo principal, la analiza y devuelve los códigos encontrados.
self.onmessage = async (event: MessageEvent<ImageData>) => {
  const image = event.data;
  frame++;
  colorsToLight(image.data, frame % 2 === 0 ? 1 : 2); // fondos azules/verdes/rojos -> claros
  let codes: Code[] = [];
  let engine: Engine = "zxing";
  try {
    const native = await nativePromise;
    if (native) {
      engine = "nativo";
      codes = (await native.detect(image)).map((c) => ({
        format: c.format,
        rawValue: c.rawValue,
        cornerPoints: c.cornerPoints.map((p) => ({ x: p.x, y: p.y })),
      }));
    } else {
      codes = await readWithZxing(image);
    }
  } catch (err) {
    console.error(err);
  }
  self.postMessage({ engine, codes });
};

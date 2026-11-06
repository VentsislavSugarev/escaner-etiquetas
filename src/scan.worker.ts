// "Worker": código que se ejecuta en un hilo aparte. Aquí se analiza cada imagen
// sin bloquear la pantalla, así los botones y el vídeo siguen fluidos mientras lee.
import { prepareZXingModule, purgeZXingModule, readBarcodes, type ReaderOptions } from "zxing-wasm/reader";
// "?url": Vite copia el .wasm a la web y nos da su ruta (se carga de nuestro servidor, sin internet).
import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";
import { colorsToLight } from "./image";
import type { Code, Engine, WorkerReply, WorkerRequest } from "./scanner";

// ---------- Motor 1: lector nativo (Chrome en Android; también funciona dentro de workers) ----------
interface NativeDetector {
  detect(image: ImageData): Promise<Code[]>;
}
interface NativeDetectorClass {
  new (options: { formats: string[] }): NativeDetector;
  getSupportedFormats(): Promise<string[]>;
}
// Sin UPC-E: en la tienda no hay, y los lectores "leen" la mitad izquierda de algunas
// pegatinas EAN-13 como si fuera un UPC-E (salía una pegatina falsa con otro número).
const NATIVE_FORMATS = ["code_128", "ean_13", "ean_8", "upc_a"];

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
let nativeFailed = false; // si el lector nativo da error, usamos zxing el resto de la sesión

async function readNative(native: NativeDetector, image: ImageData): Promise<Code[]> {
  return (await native.detect(image)).map((c) => ({
    format: c.format,
    rawValue: c.rawValue,
    cornerPoints: c.cornerPoints.map((p) => ({ x: p.x, y: p.y })),
  }));
}

// ---------- Motor 2: zxing en WebAssembly (iPhone y resto) ----------
// Se carga solo si hace falta: en Android con lector nativo nos ahorramos ~1 MB de descarga.
let zxingLoading: Promise<unknown> | null = null;
let lastRetry = 0;
const RETRY_EVERY_MS = 5000;

function loadZxing(): Promise<unknown> {
  const loading = prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? wasmUrl : prefix + path),
    },
    fireImmediately: true,
  });
  loading.catch(() => {}); // el error se trata al leer (readWithZxing)
  return loading;
}

// Empieza a cargar zxing ya si no hay lector nativo (así está listo para el primer fotograma).
void nativePromise.then((native) => {
  if (!native) zxingLoading ??= loadZxing();
});

const zxingOptions: ReaderOptions = {
  // code_128 = etiqueta del distribuidor, ean_13 = pegatina; el resto para avisar de formatos raros.
  // Sin UPC-E a propósito (ver NATIVE_FORMATS arriba).
  formats: ["Code128", "EAN13", "EAN8", "UPCA"],
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
};

async function readWithZxing(image: ImageData): Promise<Code[]> {
  zxingLoading ??= loadZxing();
  try {
    await zxingLoading;
  } catch {
    // zxing no reintenta solo: si falló la descarga (p. ej. sin red), lo pedimos otra vez cada 5 s.
    if (Date.now() - lastRetry > RETRY_EVERY_MS) {
      lastRetry = Date.now();
      purgeZXingModule();
      zxingLoading = loadZxing();
    }
    throw new Error("No se pudo cargar el lector (¿sin conexión?). Reintentando…");
  }
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
self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, image, forceZxing } = event.data;
  frame++;
  colorsToLight(image.data, frame % 2 === 0 ? 1 : 2); // fondos azules/verdes/rojos -> claros
  let codes: Code[] = [];
  let engine: Engine = "zxing";
  let error: string | undefined;
  try {
    const native = forceZxing || nativeFailed ? null : await nativePromise;
    if (native) {
      try {
        codes = await readNative(native, image);
        engine = "nativo";
      } catch (err) {
        console.error(err);
        nativeFailed = true;
        codes = await readWithZxing(image);
      }
    } else {
      codes = await readWithZxing(image);
    }
  } catch (err) {
    error = (err as Error).message;
  }
  const reply: WorkerReply = { id, engine, codes, error };
  self.postMessage(reply);
};

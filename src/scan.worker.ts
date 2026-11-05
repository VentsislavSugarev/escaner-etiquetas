// "Worker": código que se ejecuta en un hilo aparte. Aquí zxing analiza cada imagen
// sin bloquear la pantalla, así los botones y el vídeo siguen fluidos mientras lee.
import { prepareZXingModule, readBarcodes, type ReaderOptions } from "zxing-wasm/reader";
// "?url": Vite copia el .wasm a la web y nos da su ruta (se carga de nuestro servidor, sin internet).
import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";
import type { Code } from "./scanner";

prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? wasmUrl : prefix + path),
  },
  fireImmediately: true, // carga el .wasm ya, no al primer escaneo
});

const options: ReaderOptions = {
  // code_128 = etiqueta del distribuidor, ean_13 = pegatina; el resto para avisar de formatos raros.
  formats: ["Code128", "EAN13", "EAN8", "UPCA", "UPCE"],
  tryHarder: true, // más preciso con códigos pequeños o borrosos
  tryRotate: true, // también códigos girados 90° (móvil en vertical y tira en horizontal)
  tryInvert: false, // no hay códigos blancos sobre negro: nos ahorramos una pasada entera
  maxNumberOfSymbols: 32,
};

// Nombres de zxing -> nombres cortos que mostramos en la app
const FORMAT_NAMES: Record<string, string> = {
  Code128: "code_128",
  EAN13: "ean_13",
  EAN8: "ean_8",
  UPCA: "upc_a",
  UPCE: "upc_e",
};

// Recibe una imagen del hilo principal, la analiza y devuelve los códigos encontrados.
self.onmessage = async (event: MessageEvent<ImageData>) => {
  let codes: Code[] = [];
  try {
    const results = await readBarcodes(event.data, options);
    codes = results
      .filter((r) => r.isValid)
      .map((r) => ({
        format: FORMAT_NAMES[r.format] ?? r.format,
        rawValue: r.text,
        cornerPoints: [r.position.topLeft, r.position.topRight, r.position.bottomRight, r.position.bottomLeft],
      }));
  } catch (err) {
    console.error(err);
  }
  self.postMessage(codes);
};

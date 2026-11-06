// Historial de productos escaneados, guardado en el propio móvil (localStorage).

export interface HistoryEntry {
  date: string; // fecha y hora en formato ISO, p. ej. "2026-11-05T22:41:03.000Z"
  code: string; // código de 17 dígitos
  ean: string; // pegatina que corresponde
  packs: number; // pegatinas que había que pegar
  placed?: number; // pegatinas que se marcaron como pegadas (no existe en entradas antiguas)
}

const KEY = "escaner-historial";

export function loadHistory(): HistoryEntry[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
  } catch {
    return []; // si los datos están corruptos o no hay acceso, empezamos de cero
  }
}

function saveHistory(entries: HistoryEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    // Sin espacio o modo privado: no se guarda, pero la app sigue funcionando.
  }
}

export function addToHistory(entry: HistoryEntry): void {
  saveHistory([...loadHistory(), entry]);
}

// Apunta cuántas pegatinas se han pegado en la entrada MÁS RECIENTE de ese producto.
// Pura (devuelve una lista nueva): fácil de probar.
export function withPlaced(entries: HistoryEntry[], code: string, placed: number): HistoryEntry[] {
  const index = entries.findLastIndex((e) => e.code === code);
  if (index === -1) return entries;
  const copy = [...entries];
  copy[index] = { ...copy[index], placed };
  return copy;
}

export function savePlaced(code: string, placed: number): void {
  saveHistory(withPlaced(loadHistory(), code, placed));
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nada que hacer
  }
}

// Fecha legible en hora local: "05/11/2026, 23:41:03".
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-ES");
}

// Excel convierte los números largos a "8,72E+16" y pierde las últimas cifras.
// Escritos como ="87202458470870003" los trata como texto y los muestra enteros.
function asText(code: string): string {
  return `="${code}"`;
}

// CSV con ";" (lo que espera Excel en español). Pura: fácil de probar.
export function toCsv(entries: HistoryEntry[]): string {
  const rows = [["fecha", "codigo_producto", "ean_pegatina", "packs", "pegadas"]];
  for (const e of entries) {
    rows.push([formatDate(e.date), asText(e.code), asText(e.ean), String(e.packs), e.placed === undefined ? "" : String(e.placed)]);
  }
  return rows.map((r) => r.join(";")).join("\r\n") + "\r\n";
}

// Comparte el CSV (WhatsApp, correo, Archivos…) si el móvil lo permite; si no, lo descarga.
export async function exportCsv(entries: HistoryEntry[]): Promise<void> {
  const name = `historial-${new Date().toISOString().slice(0, 10)}.csv`;
  // "\uFEFF" (BOM) hace que Excel lea bien las tildes.
  const file = new File(["\uFEFF" + toCsv(entries)], name, { type: "text/csv" });
  // Sin ningún "await" antes de share(): el navegador solo lo permite justo tras el toque.
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (err) {
      if ((err as Error).name === "AbortError") return; // el usuario canceló
    }
  }
  // Plan B: simula un clic en un enlace para descargarlo.
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  // iPhone pregunta "¿Descargar?" antes de leer el archivo: si se borra antes, falla.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

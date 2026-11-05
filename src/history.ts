// Historial de productos escaneados, guardado en el propio móvil (localStorage).

export interface HistoryEntry {
  date: string; // fecha y hora en formato ISO, p. ej. "2026-11-05T22:41:03.000Z"
  code: string; // código de 17 dígitos
  ean: string; // pegatina que corresponde
  packs: number;
}

const KEY = "escaner-historial";

export function loadHistory(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as HistoryEntry[];
  } catch {
    return []; // si los datos están corruptos o no hay acceso, empezamos de cero
  }
}

export function addToHistory(entry: HistoryEntry): void {
  const all = loadHistory();
  all.push(entry);
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Sin espacio o modo privado: no se guarda, pero la app sigue funcionando.
  }
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nada que hacer
  }
}

// Fecha legible en hora local: "05/11/2026 23:41:03".
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-ES");
}

// CSV con ";" (lo que espera Excel en español). Pura: fácil de probar.
export function toCsv(entries: HistoryEntry[]): string {
  const rows = [["fecha", "codigo_producto", "ean_pegatina", "packs"]];
  for (const e of entries) {
    rows.push([formatDate(e.date), e.code, e.ean, String(e.packs)]);
  }
  return rows.map((r) => r.join(";")).join("\r\n") + "\r\n";
}

// Crea el archivo en memoria y simula un clic en un enlace para descargarlo.
export function downloadCsv(entries: HistoryEntry[]): void {
  // "﻿" (BOM) hace que Excel lea bien las tildes.
  const blob = new Blob(["﻿" + toCsv(entries)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `historial-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

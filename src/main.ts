import { hasTorch, setTorch, startCamera } from "./camera";
import { feedback, unlockAudio } from "./feedback";
import { addToHistory, clearHistory, downloadCsv, formatDate, loadHistory } from "./history";
import { drawBoxes, type Box } from "./overlay";
import { classify } from "./rules";
import { createScanner, type DetectedBarcode, type Scanner } from "./scanner";

// ---------- Elementos del HTML ----------
// "$" busca un elemento por id; <T> indica de qué tipo es (vídeo, botón…).
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const video = $<HTMLVideoElement>("video");
const canvas = $<HTMLCanvasElement>("overlay");
const message = $<HTMLDivElement>("message");
const warning = $<HTMLDivElement>("warning");
const stats = $<HTMLButtonElement>("stats");
const codesList = $<HTMLPreElement>("codes");
const torchButton = $<HTMLButtonElement>("torch");
const counterBar = $<HTMLDivElement>("counter-bar");
const countText = $<HTMLDivElement>("count");
const plusButton = $<HTMLButtonElement>("plus");
const minusButton = $<HTMLButtonElement>("minus");
const startButton = $<HTMLButtonElement>("start");
const historyPanel = $<HTMLElement>("history");
const historyRows = $<HTMLTableSectionElement>("history-rows");
const historyEmpty = $<HTMLParagraphElement>("history-empty");

// ---------- Estado de la app ----------
interface Target {
  raw: string; // código de 17 dígitos del producto
  ean: string; // pegatina que buscamos
  packs: number; // cuántas pegatinas hay que pegar
}
let target: Target | null = null;
let placed = 0; // pegatinas ya pegadas (contador manual)
let candidate: string | null = null; // producto leído en el frame anterior (pendiente de confirmar)
let lastMatchFeedback = 0; // momento del último pitido de "coincide", para no pitar más de 1/s
let lastUnknown = "";
let warningTimer = 0;
let readsThisSecond = 0;

const MATCH_FEEDBACK_EVERY_MS = 1000;
const WARNING_VISIBLE_MS = 5000;

// ---------- Arranque ----------
startButton.addEventListener("click", async () => {
  startButton.disabled = true;
  unlockAudio(); // tiene que ser aquí, dentro del toque, por iPhone
  message.textContent = "Abriendo cámara…";
  try {
    const [stream, scanner] = await Promise.all([startCamera(video), createScanner()]);
    startButton.classList.add("hidden");
    setupTorch(stream);
    updateMessage();
    startLoop(scanner);
  } catch (err) {
    startButton.disabled = false;
    message.textContent = `Error: ${(err as Error).message}`;
  }
});

// ---------- Bucle de detección ----------
// requestAnimationFrame llama a "tick" en cada refresco de pantalla (~60 veces/s).
// Solo lanzamos una detección si la anterior ya terminó (busy = false).
function startLoop(scanner: Scanner): void {
  let busy = false;

  const tick = () => {
    requestAnimationFrame(tick);
    if (busy || video.readyState < 2) return; // < 2 = aún no hay imagen
    busy = true;
    scanner
      .detect(video)
      .then(handleDetections)
      .catch((err) => console.error(err))
      .finally(() => (busy = false));
  };
  requestAnimationFrame(tick);

  // Cada segundo mostramos cuántas detecciones se hicieron.
  setInterval(() => {
    stats.textContent = `${readsThisSecond} lect/s · ${scanner.engine} · ${video.videoWidth}×${video.videoHeight}`;
    readsThisSecond = 0;
  }, 1000);
}

// Se ejecuta con los códigos encontrados en un frame.
function handleDetections(barcodes: DetectedBarcode[]): void {
  readsThisSecond++;
  const items = barcodes.map((b) => ({ barcode: b, info: classify(b.rawValue) }));

  // 1) Producto: hay que leerlo igual en 2 frames seguidos para aceptarlo.
  const product = items.find((i) => i.info.kind === "product")?.info;
  if (product?.kind === "product" && product.raw !== target?.raw) {
    if (candidate === product.raw) {
      setTarget(product);
      candidate = null;
    } else {
      candidate = product.raw;
    }
  } else if (!product) {
    candidate = null;
  }

  // 2) Formato desconocido: aviso visible.
  const unknown = items.find((i) => i.info.kind === "unknown");
  if (unknown) showWarning(unknown.barcode);

  // 3) Recuadros y pitido si alguna pegatina coincide.
  const boxes: Box[] = [];
  let anyMatch = false;
  for (const { barcode, info } of items) {
    let color = "rgba(255,255,255,0.8)";
    let lineWidth = 2;
    if (info.kind === "product") {
      color = "#3d8bff";
      lineWidth = 3;
    } else if (info.kind === "unknown") {
      color = "#f5b400";
      lineWidth = 3;
    } else if (target) {
      const match = info.ean === target.ean;
      anyMatch ||= match;
      color = match ? "#00e676" : "#ff3b30";
      lineWidth = match ? 10 : 4;
    }
    boxes.push({ points: barcode.cornerPoints, color, lineWidth });
  }
  drawBoxes(canvas, video, boxes);

  const now = performance.now();
  if (anyMatch && target && placed < target.packs && now - lastMatchFeedback > MATCH_FEEDBACK_EVERY_MS) {
    lastMatchFeedback = now;
    feedback.match();
  }

  // Panel de depuración (se abre tocando las lect/s).
  if (!codesList.classList.contains("hidden")) {
    codesList.textContent = items.length
      ? items.map((i) => `${i.barcode.format.padEnd(8)} ${i.barcode.rawValue}  → ${i.info.kind}`).join("\n")
      : "(ningún código)";
  }
}

// ---------- Producto objetivo y contador ----------
function setTarget(product: Target): void {
  target = { raw: product.raw, ean: product.ean, packs: product.packs };
  placed = 0;
  addToHistory({ date: new Date().toISOString(), code: product.raw, ean: product.ean, packs: product.packs });
  feedback.product();
  updateMessage();
}

function updateMessage(): void {
  message.classList.remove("searching", "complete");
  if (!target) {
    message.textContent = "Escanea el producto";
    counterBar.classList.add("hidden");
    return;
  }

  counterBar.classList.remove("hidden");
  countText.textContent = `${placed} / ${target.packs}`;
  const done = placed >= target.packs;
  plusButton.disabled = done;
  plusButton.textContent = done ? "✔ Completo" : "+1 pegada";
  minusButton.disabled = placed === 0;

  if (done) {
    message.classList.add("complete");
    message.innerHTML = `✔ Completo<br><span class="ean">${target.ean}</span>`;
  } else {
    const n = target.packs;
    message.classList.add("searching");
    message.innerHTML = `Busca: <span class="ean">${target.ean}</span><br>necesitas ${n} pegatina${n === 1 ? "" : "s"}`;
  }
}

plusButton.addEventListener("click", () => {
  if (!target || placed >= target.packs) return;
  placed++;
  if (placed === target.packs) feedback.complete();
  updateMessage();
});

minusButton.addEventListener("click", () => {
  if (placed > 0) placed--;
  updateMessage();
});

// ---------- Aviso de formato desconocido ----------
function showWarning(barcode: DetectedBarcode): void {
  const text = `⚠ Formato desconocido (${barcode.format}): ${barcode.rawValue}`;
  if (text !== lastUnknown) {
    lastUnknown = text;
    warning.textContent = text;
    feedback.unknown(); // solo pita la primera vez que aparece ese código
  }
  warning.classList.remove("hidden");
  clearTimeout(warningTimer);
  warningTimer = window.setTimeout(() => {
    warning.classList.add("hidden");
    lastUnknown = "";
  }, WARNING_VISIBLE_MS);
}

// ---------- Linterna ----------
function setupTorch(stream: MediaStream): void {
  if (!hasTorch(stream)) return; // en iPhone no se muestra el botón
  let on = false;
  torchButton.classList.remove("hidden");
  torchButton.addEventListener("click", async () => {
    try {
      await setTorch(stream, !on);
      on = !on;
      torchButton.classList.toggle("on", on);
    } catch {
      torchButton.classList.add("hidden");
    }
  });
}

// ---------- Panel de depuración ----------
stats.addEventListener("click", () => codesList.classList.toggle("hidden"));

// ---------- Historial ----------
function renderHistory(): void {
  const entries = loadHistory().reverse(); // los más recientes arriba
  historyRows.replaceChildren(
    ...entries.map((e) => {
      const tr = document.createElement("tr");
      for (const value of [formatDate(e.date), e.ean, String(e.packs)]) {
        const td = document.createElement("td");
        td.textContent = value;
        tr.append(td);
      }
      return tr;
    }),
  );
  historyEmpty.classList.toggle("hidden", entries.length > 0);
}

$("history-open").addEventListener("click", () => {
  renderHistory();
  historyPanel.classList.remove("hidden");
});
$("history-close").addEventListener("click", () => historyPanel.classList.add("hidden"));
$("history-export").addEventListener("click", () => downloadCsv(loadHistory()));
$("history-clear").addEventListener("click", () => {
  if (confirm("¿Borrar todo el historial?")) {
    clearHistory();
    renderHistory();
  }
});

// ---------- PWA: guarda la app para poder usarla sin conexión ----------
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

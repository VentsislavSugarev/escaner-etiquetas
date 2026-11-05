import { hasTorch, isCameraAlive, keepScreenOn, setTorch, startCamera } from "./camera";
import { feedback, unlockAudio } from "./feedback";
import { addToHistory, clearHistory, downloadCsv, loadHistory, type HistoryEntry } from "./history";
import { drawBoxes, type Box } from "./overlay";
import { classify } from "./rules";
import { createScanner, type Code, type Scanner } from "./scanner";

// ---------- Elementos del HTML ----------
// "$" busca un elemento por id; <T> indica de qué tipo es (vídeo, botón…).
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const video = $<HTMLVideoElement>("video");
const canvas = $<HTMLCanvasElement>("overlay");
const card = $<HTMLDivElement>("card");
const cardLabel = $<HTMLDivElement>("card-label");
const cardMain = $<HTMLDivElement>("card-main");
const cardSub = $<HTMLDivElement>("card-sub");
const warning = $<HTMLDivElement>("warning");
const stats = $<HTMLButtonElement>("stats");
const codesList = $<HTMLPreElement>("codes");
const torchButton = $<HTMLButtonElement>("torch");
const verdict = $<HTMLDivElement>("verdict");
const counter = $<HTMLDivElement>("counter");
const dots = $<HTMLDivElement>("dots");
const countText = $<HTMLSpanElement>("count");
const plusText = $<HTMLSpanElement>("plus-text");
const plusButton = $<HTMLButtonElement>("plus");
const minusButton = $<HTMLButtonElement>("minus");
const startScreen = $<HTMLElement>("start-screen");
const startButton = $<HTMLButtonElement>("start");
const startError = $<HTMLParagraphElement>("start-error");
const historyPanel = $<HTMLElement>("history");
const historyRows = $<HTMLTableSectionElement>("history-rows");
const historyEmpty = $<HTMLParagraphElement>("history-empty");
const historySummary = $<HTMLParagraphElement>("history-summary");

// ---------- Estado de la app ----------
interface Target {
  raw: string; // código de 17 dígitos del producto
  ean: string; // pegatina que buscamos
  packs: number; // cuántas pegatinas hay que pegar
}
let target: Target | null = null;
let placed = 0; // pegatinas ya pegadas (contador manual)
let candidate: string | null = null; // producto leído en el frame anterior (pendiente de confirmar)
let stream: MediaStream | null = null;
let torchOn = false;

let lastMatchFeedback = 0; // último pitido de "coincide" (no más de 1 por segundo)
let lastBoxes: Box[] = []; // recuadros del último frame con códigos…
let lastBoxesAt = 0; // …y cuándo se vieron (para que no parpadeen si un frame falla)
let verdictAt = 0;
let lastUnknown = "";
let warningTimer = 0;
let readsThisSecond = 0;

const MATCH_FEEDBACK_EVERY_MS = 1000;
const KEEP_BOXES_MS = 300; // si un frame no ve nada, mantenemos los recuadros este tiempo
const KEEP_VERDICT_MS = 500;
const WARNING_VISIBLE_MS = 5000;

// ---------- Arranque ----------
startButton.addEventListener("click", async () => {
  startButton.disabled = true;
  startButton.textContent = "Abriendo cámara…";
  startError.classList.add("hidden");
  unlockAudio(); // tiene que ser aquí, dentro del toque, por iPhone
  try {
    const [s, scanner] = await Promise.all([startCamera(video), createScanner()]);
    stream = s;
    torchButton.classList.toggle("hidden", !hasTorch(s));
    startScreen.classList.add("hidden");
    void keepScreenOn();
    render();
    startLoop(scanner);
  } catch (err) {
    startButton.disabled = false;
    startButton.textContent = "Reintentar";
    startError.textContent = cameraErrorText(err as Error);
    startError.classList.remove("hidden");
  }
});

function cameraErrorText(err: Error): string {
  if (err.name === "NotAllowedError") {
    return "No hay permiso para usar la cámara. Actívalo en los ajustes del navegador y vuelve a intentarlo.";
  }
  if (err.name === "NotFoundError") return "No se ha encontrado ninguna cámara.";
  if (err.name === "NotReadableError") return "La cámara está ocupada por otra app. Ciérrala y reintenta.";
  return `Error: ${err.message}`;
}

// Al volver a la app (iPhone corta la cámara al salir), la reabrimos si hace falta.
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || !stream) return;
  void keepScreenOn();
  if (!isCameraAlive(stream)) {
    try {
      stream = await startCamera(video);
      torchOn = false;
      torchButton.classList.remove("on");
      torchButton.classList.toggle("hidden", !hasTorch(stream));
    } catch {
      // Si falla, el usuario puede recargar la página.
    }
  } else {
    void video.play();
  }
});

// ---------- Bucle de detección ----------
// requestAnimationFrame llama a "tick" en cada refresco de pantalla (~60 veces/s).
// Solo lanzamos una detección si la anterior ya terminó (busy = false).
function startLoop(scanner: Scanner): void {
  let busy = false;

  const tick = () => {
    requestAnimationFrame(tick);
    if (busy || video.readyState < 2 || !historyPanel.classList.contains("hidden")) return;
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
function handleDetections(codes: Code[]): void {
  readsThisSecond++;
  const now = performance.now();
  const items = codes.map((code) => ({ code, info: classify(code.rawValue) }));

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
  if (unknown) showWarning(unknown.code);

  // 3) Recuadros. En la tira las pegatinas iguales van juntas (A A A B B C…),
  //    así que ponemos las últimas cifras encima de cada una para ver dónde estás.
  let boxes: Box[] = [];
  let matches = 0; // pegatinas que coinciden en este frame
  let stickers = 0;
  for (const { code, info } of items) {
    const points = code.cornerPoints;
    if (info.kind === "product") {
      boxes.push({ points, color: "#3d8bff", lineWidth: 4, label: "PRODUCTO" });
    } else if (info.kind === "unknown") {
      boxes.push({ points, color: "#ffc400", lineWidth: 4, label: "?" });
    } else {
      stickers++;
      const tail = info.ean.slice(-4);
      if (!target) {
        boxes.push({ points, color: "rgba(255,255,255,0.85)", lineWidth: 2, label: tail });
      } else if (info.ean === target.ean) {
        matches++;
        boxes.push({ points, color: "#00c853", lineWidth: 9, label: `✓ ${tail}` });
      } else {
        boxes.push({ points, color: "#ff3b30", lineWidth: 4, label: tail });
      }
    }
  }
  if (boxes.length) {
    lastBoxes = boxes;
    lastBoxesAt = now;
  } else if (now - lastBoxesAt < KEEP_BOXES_MS) {
    boxes = lastBoxes;
  }
  drawBoxes(canvas, video, boxes);

  // 4) Veredicto grande y pitido.
  const done = target !== null && placed >= target.packs;
  if (target && !done && matches > 0) {
    // No contamos cuántas se ven: si van pegadas en la tira, el lector a veces
    // junta varias iguales en un solo recuadro (que además marca bien el grupo).
    showVerdict("match", "✓ ¡Esta es!", now);
    if (now - lastMatchFeedback > MATCH_FEEDBACK_EVERY_MS) {
      lastMatchFeedback = now;
      feedback.match();
    }
  } else if (target && !done && stickers > 0) {
    showVerdict("nomatch", "✗ No es esta", now);
  } else if (now - verdictAt > KEEP_VERDICT_MS) {
    verdict.classList.add("hidden");
  }

  // Panel de depuración (se abre tocando las lect/s).
  if (!codesList.classList.contains("hidden")) {
    codesList.textContent = items.length
      ? items.map((i) => `${i.code.format.padEnd(8)} ${i.code.rawValue}  → ${i.info.kind}`).join("\n")
      : "(ningún código)";
  }
}

function showVerdict(kind: "match" | "nomatch", text: string, now: number): void {
  // Un "✗" no sustituye enseguida a un "✓" reciente: evita parpadeos al mover el móvil.
  if (kind === "nomatch" && verdict.classList.contains("match") && now - verdictAt < KEEP_VERDICT_MS) return;
  verdictAt = now;
  verdict.className = `verdict ${kind}`;
  verdict.textContent = text;
}

// ---------- Producto objetivo y contador ----------
function setTarget(product: Target): void {
  target = { raw: product.raw, ean: product.ean, packs: product.packs };
  placed = 0;
  addToHistory({ date: new Date().toISOString(), code: product.raw, ean: product.ean, packs: product.packs });
  feedback.product();
  render();
}

// Muestra el número de la pegatina con el final destacado: el principio (8720245…)
// se repite en muchos productos; lo que hay que mirar son las últimas cifras.
function eanHtml(ean: string): string {
  return `<span class="ean"><span class="ean-head">${ean.slice(0, 7)}</span><span class="ean-tail">${ean.slice(7)}</span></span>`;
}

// Actualiza la tarjeta y el contador según el estado.
function render(): void {
  card.classList.remove("searching", "complete");
  if (!target) {
    cardLabel.textContent = "Paso 1";
    cardMain.textContent = "Escanea la etiqueta del producto";
    cardSub.textContent = "La del distribuidor, con 17 cifras";
    counter.classList.add("hidden");
    return;
  }

  const { ean, packs } = target;
  const done = placed >= packs;
  counter.classList.remove("hidden");
  countText.textContent = `${placed} / ${packs}`;
  plusText.textContent = done ? "✔ Completo" : "+1 pegada";
  plusButton.disabled = done;
  minusButton.disabled = placed === 0;
  dots.replaceChildren(
    ...Array.from({ length: packs }, (_, i) => {
      const dot = document.createElement("span");
      dot.className = i < placed ? "dot filled" : "dot";
      return dot;
    }),
  );

  if (done) {
    card.classList.add("complete");
    cardLabel.textContent = "✔ Completo";
    cardMain.innerHTML = eanHtml(ean);
    cardSub.textContent = "Escanea el siguiente producto";
    verdict.classList.add("hidden");
  } else {
    card.classList.add("searching");
    cardLabel.textContent = "Busca esta pegatina";
    cardMain.innerHTML = eanHtml(ean);
    const left = packs - placed;
    cardSub.textContent = placed === 0 ? `Necesitas ${packs} pegatina${packs === 1 ? "" : "s"}` : `Faltan ${left} de ${packs}`;
  }
}

plusButton.addEventListener("click", () => {
  if (!target || placed >= target.packs) return;
  placed++;
  if (placed === target.packs) feedback.complete();
  else navigator.vibrate?.(30);
  render();
});

minusButton.addEventListener("click", () => {
  if (placed > 0) placed--;
  render();
});

// ---------- Aviso de formato desconocido ----------
function showWarning(code: Code): void {
  const text = `⚠ Formato desconocido (${code.format}): ${code.rawValue}`;
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
torchButton.addEventListener("click", async () => {
  if (!stream) return;
  try {
    await setTorch(stream, !torchOn);
    torchOn = !torchOn;
    torchButton.classList.toggle("on", torchOn);
  } catch {
    torchButton.classList.add("hidden");
  }
});

// ---------- Panel de depuración ----------
stats.addEventListener("click", () => codesList.classList.toggle("hidden"));

// ---------- Historial ----------
function shortDate(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function renderHistory(): void {
  const entries: HistoryEntry[] = loadHistory().reverse(); // los más recientes arriba
  historyRows.replaceChildren(
    ...entries.map((e) => {
      const tr = document.createElement("tr");
      for (const value of [shortDate(e.date), e.ean, String(e.packs)]) {
        const td = document.createElement("td");
        td.textContent = value;
        tr.append(td);
      }
      return tr;
    }),
  );
  const totalStickers = entries.reduce((sum, e) => sum + e.packs, 0);
  historySummary.textContent = entries.length
    ? `${entries.length} producto${entries.length === 1 ? "" : "s"} · ${totalStickers} pegatinas`
    : "";
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

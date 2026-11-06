import { cameraName, hasTorch, isCameraAlive, keepScreenOn, setTorch, startCamera } from "./camera";
import { feedback, isMuted, setMuted, unlockAudio } from "./feedback";
import { addToHistory, clearHistory, exportCsv, loadHistory, savePlaced, type HistoryEntry } from "./history";
import { drawBoxes, visibleRegion, type Box } from "./overlay";
import { classify, type Classification } from "./rules";
import { createScanner, type Code, type Scanner } from "./scanner";
import { StableFilter } from "./stability";

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
const soundButton = $<HTMLButtonElement>("sound");
const torchButton = $<HTMLButtonElement>("torch");
const verdict = $<HTMLDivElement>("verdict");
const counter = $<HTMLDivElement>("counter");
const dots = $<HTMLDivElement>("dots");
const countText = $<HTMLSpanElement>("count");
const plusText = $<HTMLSpanElement>("plus-text");
const plusButton = $<HTMLButtonElement>("plus");
const minusButton = $<HTMLButtonElement>("minus");
const againButton = $<HTMLButtonElement>("again");
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
let placed = 0; // pegatinas ya pegadas del producto actual (contador manual)
// Lo pegado de cada producto en esta sesión: si escaneas otro por error y vuelves, no pierdes la cuenta.
const progress = new Map<string, number>();
let stream: MediaStream | null = null;
let torchOn = false;

// Códigos que se están viendo (ya filtrados) y cuándo se vieron por última vez.
// Se mantienen un momento aunque un fotograma no los lea, para que los recuadros no parpadeen.
interface Seen {
  codes: Code[]; // todas las pegatinas iguales del fotograma (en la tira van varias seguidas)
  info: Classification;
  at: number;
}
const seen = new Map<string, Seen>();
const stability = new StableFilter();

let matchLastSeen = 0; // última vez que se vio la pegatina correcta
let verdictAt = 0;
const warned = new Set<string>(); // códigos raros ya avisados mientras el aviso está a la vista
let warningTimer = 0;
let readsThisSecond = 0;

const KEEP_SEEN_MS = 500; // cuánto se mantiene un recuadro sin volver a leerlo
const MATCH_GONE_MS = 1000; // si la correcta desaparece este tiempo, al volver pita otra vez
const KEEP_VERDICT_MS = 500;
const WARNING_VISIBLE_MS = 5000;
const MAX_DOTS = 24; // con más pegatinas que esto, solo se muestra el número
const PLUS_COOLDOWN_MS = 400; // dos toques más seguidos que esto = doble toque sin querer

// ---------- Guardar lo que estás haciendo ----------
// iPhone y Android a veces recargan la app al volver a ella: guardamos el producto actual
// y las cuentas para no perderlos.
const SESSION_KEY = "escaner-sesion";
const SESSION_MAX_MS = 4 * 60 * 60 * 1000; // pasadas 4 h sin tocar nada, se empieza de cero

function saveSession(): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ target, progress: [...progress], at: Date.now() }));
  } catch {
    // sin almacenamiento: solo dura mientras la app esté abierta
  }
}

function restoreSession(): void {
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null");
    if (!saved || Date.now() - saved.at > SESSION_MAX_MS) return;
    for (const [raw, count] of saved.progress) progress.set(raw, count);
    target = saved.target;
    placed = target ? (progress.get(target.raw) ?? 0) : 0;
  } catch {
    // datos corruptos: empezamos de cero
  }
}
restoreSession(); // NO usar setTarget aquí: añadiría otra fila al historial y pitaría

// ---------- Arranque ----------
// El lector se crea al abrir la página: así se descarga mientras lees la pantalla de inicio.
// Con ?motor=zxing en la dirección se fuerza zxing (para comparar con el nativo en Android).
const forceZxing = new URLSearchParams(location.search).get("motor") === "zxing";
const scanner = createScanner(forceZxing);
let loopStarted = false;

startButton.addEventListener("click", async () => {
  startButton.disabled = true;
  startButton.textContent = "Abriendo cámara…";
  startError.classList.add("hidden");
  unlockAudio(); // tiene que ser aquí, dentro del toque, por iPhone
  try {
    stream?.getTracks().forEach((t) => t.stop()); // suelta la cámara anterior si la había
    stream = await startCamera(video);
    torchOn = false;
    torchButton.classList.remove("on");
    torchButton.classList.toggle("hidden", !hasTorch(stream));
    startScreen.classList.add("hidden");
    void keepScreenOn();
    render();
    if (!loopStarted) {
      loopStarted = true;
      startLoop(scanner);
    }
  } catch (err) {
    showStartError(cameraErrorText(err as Error), "Reintentar");
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

// Vuelve a la pantalla de inicio con el error y un botón para reintentar.
// (Dentro de un toque iPhone deja reabrir la cámara y vuelve a activar el sonido.)
function showStartError(message: string, buttonText: string): void {
  startButton.disabled = false;
  startButton.textContent = buttonText;
  startError.textContent = message;
  startError.classList.remove("hidden");
  startScreen.classList.remove("hidden");
}

// Si iPhone pausó el sonido (bloqueo, llamada…), el siguiente toque en cualquier sitio lo reactiva.
document.addEventListener("click", unlockAudio);
document.addEventListener("touchend", unlockAudio, { passive: true }); // también al tocar el vídeo

// Al volver a la app (iPhone corta la cámara al salir), la reabrimos si hace falta.
let reopenTimer = 0;
let reopening = false; // para no reabrir la cámara dos veces a la vez

document.addEventListener("visibilitychange", () => {
  clearTimeout(reopenTimer); // al salir (o volver otra vez) se cancela el intento pendiente
  if (document.visibilityState !== "visible" || !stream) return;
  void keepScreenOn();
  void video.play();
  // iPhone tarda un momento en devolver la imagen: solo reabrimos si sigue muerta al cabo de 1,5 s.
  reopenTimer = window.setTimeout(() => void reopenIfDead(), 1500);
});

async function reopenIfDead(): Promise<void> {
  if (reopening || document.visibilityState !== "visible") return;
  if (!stream || isCameraAlive(stream) || !startScreen.classList.contains("hidden")) return;
  reopening = true;
  stream.getTracks().forEach((t) => t.stop());
  try {
    stream = await startCamera(video);
    torchOn = false;
    torchButton.classList.remove("on");
    torchButton.classList.toggle("hidden", !hasTorch(stream));
  } catch (err) {
    showStartError(cameraErrorText(err as Error), "Reactivar cámara");
  } finally {
    reopening = false;
  }
}

// ---------- Bucle de detección ----------
// requestAnimationFrame llama a "tick" en cada refresco de pantalla (~60 veces/s).
// Solo lanzamos una detección si la anterior ya terminó (busy = false).
function startLoop(scanner: Scanner): void {
  let busy = false;
  let lastError = "";

  const tick = () => {
    requestAnimationFrame(tick);
    // No leemos si: aún analiza el anterior, no hay imagen, la cámara está parada o el historial está abierto.
    if (busy || video.readyState < 2 || !isCameraAlive(stream) || !historyPanel.classList.contains("hidden")) return;
    busy = true;
    // Solo la franja que no tapan la tarjeta (arriba) y el contador (abajo): lo de detrás no se ve.
    const top = card.getBoundingClientRect().bottom;
    const bottom = counter.classList.contains("hidden") ? canvas.clientHeight : counter.getBoundingClientRect().top;
    const region = visibleRegion(video.videoWidth, video.videoHeight, canvas.clientWidth, canvas.clientHeight, top, bottom);
    scanner
      .detect(video, region)
      .then((codes) => {
        lastError = "";
        handleDetections(codes);
      })
      .catch((err: Error) => {
        lastError = err.message;
        console.error(err);
      })
      .finally(() => (busy = false));
  };
  requestAnimationFrame(tick);

  // Cada segundo mostramos cuántas detecciones se hicieron (o el error, si lo hay).
  setInterval(() => {
    stats.textContent = lastError
      ? `⚠ ${lastError}`
      : `${readsThisSecond} lect/s · ${scanner.engine} · ${video.videoWidth}×${video.videoHeight}`;
    readsThisSecond = 0;
  }, 1000);
}

// Se ejecuta con los códigos encontrados en un fotograma.
function handleDetections(codes: Code[]): void {
  readsThisSecond++;
  const now = performance.now();

  // 0) Solo nos fiamos de los códigos vistos en al menos 2 de los últimos 4 fotogramas.
  const stable = stability.push(codes.map((c) => c.rawValue));
  const fresh: Seen[] = [];
  for (const value of stable) {
    const item = { codes: codes.filter((c) => c.rawValue === value), info: classify(value), at: now };
    seen.set(value, item);
    fresh.push(item);
  }
  for (const [value, item] of seen) {
    if (now - item.at > KEEP_SEEN_MS) seen.delete(value);
  }

  // 1) Producto nuevo: pasa a ser el objetivo. Si la etiqueta del producto actual sigue
  //    a la vista, no cambiamos (con dos cajas juntas saltaría de una a otra sin parar).
  const product = fresh.find((i) => i.info.kind === "product")?.info;
  const targetInView = target !== null && seen.has(target.raw);
  if (product?.kind === "product" && product.raw !== target?.raw && !targetInView) setTarget(product);

  // 2) Formato desconocido: aviso visible.
  const unknown = fresh.find((i) => i.info.kind === "unknown");
  if (unknown) showWarning(unknown.codes[0]);

  // 3) Recuadros. En la tira las pegatinas iguales van juntas (A A A B B C…),
  //    así que ponemos las últimas cifras encima de cada una para ver dónde estás.
  const boxes: Box[] = [];
  let matchVisible = false;
  let stickersVisible = false;
  for (const { codes: same, info } of seen.values()) {
    for (const { cornerPoints: points } of same) {
      if (info.kind === "product") {
        boxes.push({ points, color: "#3d8bff", lineWidth: 4, label: "PRODUCTO" });
      } else if (info.kind === "unknown") {
        boxes.push({ points, color: "#ffc400", lineWidth: 4, label: "?" });
      } else {
        stickersVisible = true;
        const tail = info.ean.slice(-4);
        if (!target) {
          boxes.push({ points, color: "rgba(255,255,255,0.85)", lineWidth: 2, label: tail });
        } else if (info.ean === target.ean) {
          matchVisible = true;
          boxes.push({ points, color: "#00c853", lineWidth: 9, label: `✓ ${tail}` });
        } else {
          boxes.push({ points, color: "#ff3b30", lineWidth: 4, label: tail });
        }
      }
    }
  }
  drawBoxes(canvas, video, boxes);

  // 4) Veredicto grande. Pita cuando la pegatina correcta APARECE, no todo el rato
  //    mientras sigue a la vista (sería muy pesado mientras pegas).
  const done = target !== null && placed >= target.packs;
  if (target && !done && matchVisible) {
    // No contamos cuántas se ven: si van pegadas en la tira, el lector a veces
    // junta varias iguales en un solo recuadro (que además marca bien el grupo).
    showVerdict("match", "✓ ¡Esta es!", now);
    if (now - matchLastSeen > MATCH_GONE_MS) feedback.match();
    matchLastSeen = now;
  } else if (target && !done && stickersVisible) {
    showVerdict("nomatch", "✗ Aquí no está", now);
  } else if (now - verdictAt > KEEP_VERDICT_MS) {
    verdict.classList.add("hidden");
  }

  // Panel de depuración (se abre tocando las lect/s): todo lo leído, también lo descartado.
  if (!codesList.classList.contains("hidden")) {
    const lines = codes.length
      ? codes
          .map((c) => {
            const kind = stable.has(c.rawValue) ? classify(c.rawValue).kind : "sin confirmar";
            return `${c.format.padEnd(8)} ${c.rawValue}  → ${kind}`;
          })
          .join("\n")
      : "(ningún código)";
    codesList.textContent = `📷 ${cameraName(stream)}\n${lines}`; // 1ª línea: qué cámara se está usando
  }
}

// (Los parpadeos ya los evita "seen", que mantiene cada código medio segundo; aquí no hace
// falta retrasar el "✗": si no, el "✓" se quedaría ~1 s sobre la pegatina equivocada.)
function showVerdict(kind: "match" | "nomatch", text: string, now: number): void {
  verdictAt = now;
  verdict.className = `verdict ${kind}`;
  verdict.textContent = text;
}

// ---------- Producto objetivo y contador ----------
function setTarget(product: Target): void {
  target = { raw: product.raw, ean: product.ean, packs: product.packs };
  const saved = progress.get(product.raw);
  // Solo se recupera una caja a medias; si ya estaba completa, es otra caja del mismo producto.
  if (saved === undefined || saved >= product.packs) {
    // Caja nueva: empieza de cero y se apunta en el historial.
    placed = 0;
    progress.set(product.raw, 0);
    addToHistory({ date: new Date().toISOString(), code: product.raw, ean: product.ean, packs: product.packs, placed: 0 });
  } else {
    placed = saved; // ya lo habías empezado: recuperamos la cuenta
  }
  matchLastSeen = 0;
  feedback.product();
  saveSession();
  render();
}

// Guarda el contador en memoria y en el historial.
function setPlaced(value: number): void {
  if (!target) return;
  placed = value;
  progress.set(target.raw, value);
  savePlaced(target.raw, value);
  saveSession();
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
  // Visible en cuanto hay alguna pegada: si una caja se quedó a medias, la siguiente igual
  // no debe heredar su cuenta.
  againButton.classList.toggle("hidden", placed === 0);
  dots.classList.toggle("hidden", packs > MAX_DOTS);
  if (packs <= MAX_DOTS) {
    dots.replaceChildren(
      ...Array.from({ length: packs }, (_, i) => {
        const dot = document.createElement("span");
        dot.className = i < placed ? "dot filled" : "dot";
        return dot;
      }),
    );
  }

  cardMain.innerHTML = eanHtml(ean);
  if (done) {
    card.classList.add("complete");
    cardLabel.textContent = "✔ Completo";
    cardSub.textContent = "Escanea el siguiente producto";
    verdict.classList.add("hidden");
  } else {
    card.classList.add("searching");
    cardLabel.textContent = "Busca esta pegatina";
    cardSub.textContent = placed === 0 ? `Necesitas ${packs} pegatina${packs === 1 ? "" : "s"}` : `Faltan ${packs - placed} de ${packs}`;
  }
}

let lastPlusAt = 0;
plusButton.addEventListener("click", () => {
  const now = performance.now();
  if (!target || placed >= target.packs || now - lastPlusAt < PLUS_COOLDOWN_MS) return;
  lastPlusAt = now;
  setPlaced(placed + 1);
  if (placed === target.packs) feedback.complete();
  else feedback.placed();
});

minusButton.addEventListener("click", () => {
  if (placed > 0) setPlaced(placed - 1);
});

// Otra caja del mismo producto: el código es el mismo, así que no se puede "volver a escanear".
againButton.addEventListener("click", () => {
  if (!target) return;
  progress.delete(target.raw);
  setTarget(target); // vuelve a empezar de cero y crea una entrada nueva en el historial
});

// ---------- Aviso de formato desconocido ----------
function showWarning(code: Code): void {
  warning.textContent = `⚠ Código no reconocido (${code.format}): ${code.rawValue}`;
  if (!warned.has(code.rawValue)) {
    warned.add(code.rawValue);
    feedback.unknown(); // solo pita la primera vez que aparece cada código
  }
  warning.classList.remove("hidden");
  clearTimeout(warningTimer);
  warningTimer = window.setTimeout(() => {
    warning.classList.add("hidden");
    warned.clear();
  }, WARNING_VISIBLE_MS);
}

// ---------- Sonido ----------
function renderSound(): void {
  soundButton.textContent = isMuted() ? "🔇" : "🔊";
  soundButton.setAttribute("aria-label", isMuted() ? "Activar sonido" : "Silenciar");
}
soundButton.addEventListener("click", () => {
  setMuted(!isMuted());
  renderSound();
});
renderSound();

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
      const placedText = e.placed === undefined ? String(e.packs) : `${e.placed} / ${e.packs}`;
      for (const value of [shortDate(e.date), e.ean, placedText]) {
        const td = document.createElement("td");
        td.textContent = value;
        tr.append(td);
      }
      if (e.placed !== undefined && e.placed < e.packs) tr.classList.add("incomplete");
      return tr;
    }),
  );
  const totalStickers = entries.reduce((sum, e) => sum + (e.placed ?? e.packs), 0);
  historySummary.textContent = entries.length
    ? `${entries.length} producto${entries.length === 1 ? "" : "s"} · ${totalStickers} pegatinas pegadas`
    : "";
  historyEmpty.classList.toggle("hidden", entries.length > 0);
}

// El gesto o botón "atrás" del móvil cierra el historial (en vez de salir de la app).
$("history-open").addEventListener("click", () => {
  renderHistory();
  historyPanel.classList.remove("hidden");
  history.pushState({ panel: "historial" }, "");
});
window.addEventListener("popstate", () => historyPanel.classList.add("hidden"));
$("history-close").addEventListener("click", () => {
  if (history.state?.panel) history.back(); // se cierra a través de "popstate"
  else historyPanel.classList.add("hidden");
});
$("history-export").addEventListener("click", () => void exportCsv(loadHistory()));
$("history-clear").addEventListener("click", () => {
  if (confirm("¿Borrar todo el historial?")) {
    clearHistory();
    // Empezar de cero también en memoria: si no, lo ya escaneado no se volvería a apuntar.
    progress.clear();
    target = null;
    placed = 0;
    saveSession();
    render();
    renderHistory();
  }
});

// ---------- PWA: guarda la app para poder usarla sin conexión ----------
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

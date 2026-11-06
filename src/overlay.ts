// Dibuja recuadros sobre el vídeo, en un <canvas> transparente encima.

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  points: Point[]; // esquinas del código en píxeles del vídeo REAL (p. ej. 1920×1080)
  color: string;
  lineWidth: number;
  label?: string; // texto pequeño encima del recuadro (p. ej. las últimas cifras)
}

// Calcula cómo se ha escalado y recortado el vídeo con "object-fit: cover".
// cover = escala hasta cubrir toda la pantalla y centra; lo que sobra queda fuera.
export function coverTransform(videoW: number, videoH: number, viewW: number, viewH: number) {
  const scale = Math.max(viewW / videoW, viewH / videoH);
  return {
    scale,
    offsetX: (viewW - videoW * scale) / 2, // negativo = parte recortada por la izquierda
    offsetY: (viewH - videoH * scale) / 2,
  };
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// La parte del vídeo que de verdad se ve en pantalla (en píxeles del vídeo).
// Con "cover" se recortan los lados (o arriba y abajo), y además la tarjeta de arriba y el
// contador de abajo tapan otra parte: no tiene sentido analizar lo que no se ve.
// Así cada fotograma tiene menos píxeles (más rápido) y no salen avisos de códigos que
// la persona ni siquiera está viendo.
// top/bottom: la franja de la pantalla (en px CSS) que no tapan la tarjeta ni el contador.
export function visibleRegion(
  videoW: number,
  videoH: number,
  viewW: number,
  viewH: number,
  top = 0,
  bottom = viewH,
): Rect {
  const { scale, offsetX, offsetY } = coverTransform(videoW, videoH, viewW, viewH);
  const x = Math.max(0, Math.floor(-offsetX / scale));
  const y = Math.min(videoH - 1, Math.max(0, Math.floor((top - offsetY) / scale)));
  const yEnd = Math.min(videoH, Math.ceil((bottom - offsetY) / scale));
  return {
    x,
    y,
    width: Math.min(videoW - x, Math.ceil(viewW / scale)),
    height: Math.max(1, yEnd - y), // al menos 1 fila aunque los paneles lo tapen todo
  };
}

export function drawBoxes(canvas: HTMLCanvasElement, video: HTMLVideoElement, boxes: Box[]): void {
  // El canvas debe tener tantos píxeles como la pantalla (x devicePixelRatio para que se vea nítido).
  const dpr = window.devicePixelRatio || 1;
  const viewW = canvas.clientWidth;
  const viewH = canvas.clientHeight;
  if (canvas.width !== Math.round(viewW * dpr) || canvas.height !== Math.round(viewH * dpr)) {
    canvas.width = Math.round(viewW * dpr);
    canvas.height = Math.round(viewH * dpr);
  }

  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // a partir de aquí dibujamos en píxeles CSS
  ctx.clearRect(0, 0, viewW, viewH);
  if (!video.videoWidth || boxes.length === 0) return;

  const { scale, offsetX, offsetY } = coverTransform(video.videoWidth, video.videoHeight, viewW, viewH);

  for (const box of boxes) {
    const pts = box.points.map((p) => ({ x: p.x * scale + offsetX, y: p.y * scale + offsetY }));

    // Recuadro, con un poco de relleno del mismo color
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.lineJoin = "round";
    // Borde oscuro debajo: así el recuadro se ve también sobre pegatinas verdes, rojas o azules.
    ctx.lineWidth = box.lineWidth + 4;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
    ctx.stroke();
    ctx.lineWidth = box.lineWidth;
    ctx.strokeStyle = box.color;
    ctx.stroke();
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = box.color;
    ctx.fill();
    ctx.globalAlpha = 1;

    if (box.label) drawLabel(ctx, box.label, box.color, pts);
  }
}

// Etiqueta tipo "pastilla" encima de la esquina superior izquierda del recuadro.
function drawLabel(ctx: CanvasRenderingContext2D, text: string, color: string, pts: Point[]): void {
  const minX = Math.min(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  ctx.font = "700 15px system-ui, -apple-system, sans-serif";
  const w = ctx.measureText(text).width + 14;
  const h = 22;
  const x = minX;
  const y = Math.max(minY - h - 4, 2);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 6);
  ctx.fill();
  ctx.fillStyle = "#000"; // negro: se lee sobre todos los colores de recuadro (verde, amarillo, rojo, azul, blanco)
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 7, y + h / 2 + 1);
}

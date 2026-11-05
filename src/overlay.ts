// Dibuja recuadros sobre el vídeo, en un <canvas> transparente encima.

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  points: Point[]; // esquinas del código en píxeles del vídeo REAL (p. ej. 1920×1080)
  color: string;
  lineWidth: number;
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
    ctx.beginPath();
    box.points.forEach((p, i) => {
      const x = p.x * scale + offsetX;
      const y = p.y * scale + offsetY;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.strokeStyle = box.color;
    ctx.lineWidth = box.lineWidth;
    ctx.lineJoin = "round";
    ctx.stroke();
  }
}

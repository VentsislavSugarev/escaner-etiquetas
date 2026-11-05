// Abre la cámara trasera en alta resolución y la conecta al <video>.
export async function startCamera(video: HTMLVideoElement): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Este navegador no permite usar la cámara (¿falta HTTPS?).");
  }

  // "ideal" = lo intenta, pero si el móvil no llega acepta lo que haya.
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: "environment", // cámara trasera
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
  });

  video.srcObject = stream;
  await video.play();
  void setContinuousFocus(stream);
  return stream;
}

// Las capacidades extra (linterna, enfoque) no están en los tipos estándar; las declaramos aquí.
type ExtraCapabilities = MediaTrackCapabilities & { torch?: boolean; focusMode?: string[] };

function capabilities(stream: MediaStream): ExtraCapabilities | undefined {
  return stream.getVideoTracks()[0]?.getCapabilities?.() as ExtraCapabilities | undefined;
}

// En Android pide enfoque automático continuo (por defecto algunos móviles enfocan una sola vez).
async function setContinuousFocus(stream: MediaStream): Promise<void> {
  if (!capabilities(stream)?.focusMode?.includes("continuous")) return;
  try {
    await stream.getVideoTracks()[0].applyConstraints({
      advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
    });
  } catch {
    // No pasa nada si no se puede.
  }
}

// ¿Este móvil/navegador permite encender la linterna? (Android sí; iPhone normalmente no)
export function hasTorch(stream: MediaStream): boolean {
  return capabilities(stream)?.torch === true;
}

export async function setTorch(stream: MediaStream, on: boolean): Promise<void> {
  const track = stream.getVideoTracks()[0];
  await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
}

// ¿Sigue viva la cámara? (iPhone la corta al cambiar de app o bloquear la pantalla)
export function isCameraAlive(stream: MediaStream | null): boolean {
  return stream?.getVideoTracks()[0]?.readyState === "live";
}

// Mantiene la pantalla encendida mientras se usa la app (si el navegador lo permite).
// El navegador lo suelta al salir de la app, así que hay que volver a pedirlo al volver.
export async function keepScreenOn(): Promise<void> {
  const nav = navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<unknown> } };
  try {
    await nav.wakeLock?.request("screen");
  } catch {
    // p. ej. batería baja: el sistema no lo permite
  }
}

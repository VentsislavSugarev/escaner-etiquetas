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
  return stream;
}

// La linterna no está en los tipos estándar de TypeScript; la declaramos aquí.
type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean };

// ¿Este móvil/navegador permite encender la linterna? (Android sí; iPhone normalmente no)
export function hasTorch(stream: MediaStream): boolean {
  const track = stream.getVideoTracks()[0];
  const caps = track?.getCapabilities?.() as TorchCapabilities | undefined;
  return caps?.torch === true;
}

export async function setTorch(stream: MediaStream, on: boolean): Promise<void> {
  const track = stream.getVideoTracks()[0];
  await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
}

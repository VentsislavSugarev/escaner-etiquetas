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

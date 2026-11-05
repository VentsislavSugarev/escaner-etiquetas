import { startCamera } from "./camera";

// Referencias a los elementos del HTML ("!" = sabemos que existen).
const video = document.querySelector<HTMLVideoElement>("#video")!;
const message = document.querySelector<HTMLDivElement>("#message")!;
const startButton = document.querySelector<HTMLButtonElement>("#start")!;

// La cámara se abre al pulsar: los navegadores móviles exigen un toque del usuario.
startButton.addEventListener("click", async () => {
  startButton.disabled = true;
  message.textContent = "Abriendo cámara…";
  try {
    await startCamera(video);
    startButton.classList.add("hidden");
    message.textContent = `Cámara: ${video.videoWidth}×${video.videoHeight}`;
  } catch (err) {
    startButton.disabled = false;
    message.textContent = `Error: ${(err as Error).message}`;
  }
});

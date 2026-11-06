// Pitidos (Web Audio) y vibración.

let audio: AudioContext | null = null;

// Silencio: se guarda en el móvil para que no haya que quitarlo cada vez (la vibración sigue).
const MUTE_KEY = "escaner-silencio";
let muted = readMuted();

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? "1" : "0");
  } catch {
    // sin acceso al almacenamiento: dura hasta cerrar la app
  }
}

// iPhone solo deja sonar audio si se ha creado/activado durante un toque del usuario.
// Hay que llamar a esto dentro del click del botón "Empezar".
export function unlockAudio(): void {
  audio ??= new AudioContext();
  void audio.resume();
  beep(1, 0.01, 0); // sonido mudo (volumen 0) para terminar de desbloquear en iOS
}

// Pita a una frecuencia (Hz) durante unos segundos, empezando "delay" segundos más tarde.
function beep(freq: number, seconds: number, volume = 0.3, delay = 0): void {
  // Si iPhone tiene el audio en pausa, no acumulamos pitidos (sonarían todos de golpe al reanudar).
  // El sonido mudo de desbloqueo (volumen 0) sí se lanza siempre.
  if (!audio || (volume > 0 && (muted || audio.state !== "running"))) return;
  const start = audio.currentTime + delay;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.frequency.value = freq;
  osc.type = "square";
  // Subida y bajada rápidas del volumen para que no haga "clic".
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.005);
  gain.gain.setValueAtTime(volume, start + seconds - 0.01);
  gain.gain.linearRampToValueAtTime(0, start + seconds);
  osc.connect(gain).connect(audio.destination);
  osc.start(start);
  osc.stop(start + seconds);
}

// Pitidos que vienen de un toque (+1): si iPhone tenía el audio en pausa (tras una llamada,
// por ejemplo), lo reanudamos dentro del toque y pitamos cuando ya suena.
function tapBeep(freq: number, seconds: number, volume: number, delay = 0): void {
  if (!audio || muted) return;
  if (audio.state === "running") beep(freq, seconds, volume, delay);
  else audio.resume().then(() => beep(freq, seconds, volume, delay), () => {});
}

// navigator.vibrate no existe en iPhone: el "?." evita el error.
function vibrate(pattern: number | number[]): void {
  navigator.vibrate?.(pattern);
}

export const feedback = {
  product() {
    beep(880, 0.08);
    vibrate(50);
  },
  match() {
    beep(1760, 0.12, 0.25);
    vibrate(120);
  },
  // Al pulsar "+1 pegada": en iPhone (sin vibración) el pitido es la única confirmación.
  placed() {
    tapBeep(1320, 0.04, 0.15);
    vibrate(30);
  },
  complete() {
    tapBeep(1047, 0.12, 0.3, 0);
    tapBeep(1319, 0.12, 0.3, 0.14);
    tapBeep(1568, 0.25, 0.3, 0.28);
    vibrate([100, 60, 100, 60, 200]);
  },
  unknown() {
    beep(220, 0.25, 0.25);
    vibrate([60, 60, 60]);
  },
};

// Pitidos (Web Audio) y vibración.

let audio: AudioContext | null = null;

// iPhone solo deja sonar audio si se ha creado/activado durante un toque del usuario.
// Hay que llamar a esto dentro del click del botón "Empezar".
export function unlockAudio(): void {
  audio ??= new AudioContext();
  void audio.resume();
  beep(1, 0.01, 0); // sonido mudo para terminar de desbloquear en iOS
}

// Pita a una frecuencia (Hz) durante unos segundos, empezando "delay" segundos más tarde.
function beep(freq: number, seconds: number, volume = 0.3, delay = 0): void {
  if (!audio) return;
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
  complete() {
    beep(1047, 0.12, 0.3, 0);
    beep(1319, 0.12, 0.3, 0.14);
    beep(1568, 0.25, 0.3, 0.28);
    vibrate([100, 60, 100, 60, 200]);
  },
  unknown() {
    beep(220, 0.25, 0.25);
    vibrate([60, 60, 60]);
  },
};

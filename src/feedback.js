const cues = {
  cut: { duration: 0.105, frequency: 1880, tail: 720, gain: 0.16, vibration: 9 },
  fold: { duration: 0.064, frequency: 1120, tail: 840, gain: 0.12, vibration: 8 },
  drag: { duration: 0.18, frequency: 480, tail: 335, gain: 0.20, vibration: [12, 20, 12] },
  spray: { duration: 0.17, frequency: 3150, tail: 2240, gain: 0.09, vibration: 6 },
  wipe: { duration: 0.11, frequency: 660, tail: 480, gain: 0.09, vibration: 5 },
  release: { duration: 0.12, frequency: 950, tail: 490, gain: 0.16, vibration: 16, accent: true },
  tear: { duration: 0.2, frequency: 1380, tail: 480, gain: 0.25, vibration: [23, 18, 19], accent: true },
  stone: { duration: 0.12, frequency: 2240, tail: 1720, gain: 0.13, vibration: 7 },
  rupture: { duration: 0.9, frequency: 1180, tail: 410, gain: 0.27, vibration: [44, 24, 36], accent: true },
  case: { duration: 0.07, frequency: 620, tail: 290, gain: 0.15, vibration: 14, accent: true },
  rim: { duration: 0.09, frequency: 1450, tail: 810, gain: 0.14, vibration: [8, 24, 6], accent: true },
};
const longestCue = Math.max(...Object.values(cues).map(({ duration }) => duration));

export function createFeedbackSettings(saved) {
  return { sound: saved?.sound !== false, haptics: saved?.haptics !== false };
}

export function createFeedback(settings) {
  let audio;
  let noise;
  let resuming;
  const playedAt = new Map();
  let lastTime = -Infinity;

  function activate() {
    if (!settings.sound || !globalThis.AudioContext) return;
    try {
      if (!audio) {
        audio = new AudioContext();
        noise = audio.createBuffer(1, Math.ceil(audio.sampleRate * longestCue), audio.sampleRate);
        const samples = noise.getChannelData(0);
        for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1;
      }
      if (audio.state !== 'running' && !resuming) {
        resuming = audio.resume().catch(() => {}).finally(() => { resuming = null; });
      }
    } catch { /* The physical cues remain available without Web Audio. */ }
  }

  function play(cue) {
    if (!settings.sound && !settings.haptics) return;
    const now = performance.now();
    const { duration, frequency, tail, gain, vibration, accent } = cues[cue];
    if (now - (playedAt.get(cue) ?? -Infinity) < 150 || (!accent && now - lastTime < 38)) return;
    playedAt.set(cue, now);
    lastTime = now;
    if (settings.haptics && navigator.userActivation?.hasBeenActive !== false) navigator.vibrate?.(vibration);
    if (!settings.sound || audio?.state !== 'running') return;

    const start = audio.currentTime;
    const source = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const envelope = audio.createGain();
    source.buffer = noise;
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(frequency, start);
    filter.frequency.exponentialRampToValueAtTime(tail, start + duration);
    envelope.gain.setValueAtTime(0.001, start);
    envelope.gain.linearRampToValueAtTime(gain, start + (accent ? 0.005 : 0.009));
    envelope.gain.exponentialRampToValueAtTime(gain * 0.34, start + duration * 0.36);
    envelope.gain.exponentialRampToValueAtTime(0.001, start + duration);
    source.connect(filter).connect(envelope).connect(audio.destination);
    source.start(start);
    source.stop(start + duration);
  }

  return { activate, play };
}

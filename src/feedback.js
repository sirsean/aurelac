const cues = {
  cut: { duration: 0.08, frequency: 1600, gain: 0.15, vibration: 9 },
  drag: { duration: 0.15, frequency: 430, gain: 0.19, vibration: [12, 20, 12] },
  spray: { duration: 0.17, frequency: 3150, gain: 0.11, vibration: 8 },
  release: { duration: 0.1, frequency: 800, gain: 0.14, vibration: 12 },
  tear: { duration: 0.2, frequency: 1050, gain: 0.25, vibration: [25, 18, 18] },
  stone: { duration: 0.12, frequency: 2200, gain: 0.12, vibration: 7 },
  rupture: { duration: 0.38, frequency: 510, gain: 0.27, vibration: [44, 24, 36] },
  case: { duration: 0.06, frequency: 620, gain: 0.15, vibration: 12 },
};

export function createFeedback(settings) {
  let audio;
  let noise;
  let resuming;
  let lastCue;
  let lastTime = -Infinity;

  function activate() {
    if (!settings.sound || !globalThis.AudioContext) return;
    try {
      if (!audio) {
        audio = new AudioContext();
        noise = audio.createBuffer(1, Math.ceil(audio.sampleRate * 0.4), audio.sampleRate);
        const samples = noise.getChannelData(0);
        for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1;
      }
      if (audio.state !== 'running' && !resuming) {
        resuming = audio.resume().catch(() => {}).finally(() => { resuming = null; });
      }
    } catch { /* The physical cues remain available without Web Audio. */ }
  }

  function play(cue) {
    const now = performance.now();
    if (now - lastTime < (lastCue === cue ? 150 : 40) && cue !== 'rupture') return;
    lastCue = cue;
    lastTime = now;
    const { duration, frequency, gain, vibration } = cues[cue];
    if (settings.haptics) navigator.vibrate?.(vibration);
    if (!settings.sound || audio?.state !== 'running') return;

    const start = audio.currentTime;
    const source = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const envelope = audio.createGain();
    source.buffer = noise;
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(frequency, start);
    filter.frequency.exponentialRampToValueAtTime(frequency * 0.55, start + duration);
    envelope.gain.setValueAtTime(0.001, start);
    envelope.gain.linearRampToValueAtTime(gain, start + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.001, start + duration);
    source.connect(filter).connect(envelope).connect(audio.destination);
    source.start(start);
    source.stop(start + duration);
  }

  return { activate, play };
}

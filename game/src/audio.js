// Procedural sound with plain WebAudio: no audio files at all.
// Engine hum, siren, gunshot, punch, pickup chime and a small music loop are
// all synthesized, so the game loads no sound asset and works offline.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let musicTimer = null;
  let muted = false;
  let musicStep = 0;

  // The bass line of the street loop (A minor, driving).
  const BASS_NOTES = [55, 55, 65.41, 55, 49, 55, 82.41, 73.42];

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function noiseBuffer(seconds) {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function blip(freq, seconds, type, volume, slideTo) {
    if (!ensure()) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + seconds);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + seconds + 0.02);
  }

  function noiseBurst(seconds, volume, lowFreq) {
    if (!ensure()) return;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(seconds);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowFreq || 1200;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
  }

  return {
    /** Call from any user gesture (start button, key press) to unlock sound. */
    unlock() {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = value ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    /** Engine hum follows `speed01` (0 parked .. 1 top speed). Call every frame. */
    engine(speed01, on) {
      if (!ensure()) return;
      if (!on) {
        if (engineOsc) {
          engineOsc.stop();
          engineOsc = null;
          engineGain = null;
        }
        return;
      }
      if (!engineOsc) {
        engineOsc = ctx.createOscillator();
        engineOsc.type = 'sawtooth';
        engineGain = ctx.createGain();
        engineGain.gain.value = 0.04;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 420;
        engineOsc.connect(filter);
        filter.connect(engineGain);
        engineGain.connect(master);
        engineOsc.start();
      }
      engineOsc.frequency.setValueAtTime(55 + speed01 * 130, ctx.currentTime);
      engineGain.gain.setValueAtTime(0.03 + speed01 * 0.05, ctx.currentTime);
    },
    siren(on) {
      if (!ensure() || !on) return;
      blip(660, 0.45, 'square', 0.05, 880);
      window.setTimeout(() => blip(880, 0.45, 'square', 0.05, 660), 450);
    },
    gunshot() {
      noiseBurst(0.16, 0.5, 2600);
      blip(160, 0.1, 'square', 0.25, 60);
    },
    punch() {
      noiseBurst(0.09, 0.4, 500);
    },
    pickup() {
      blip(660, 0.12, 'sine', 0.25);
      window.setTimeout(() => blip(990, 0.18, 'sine', 0.25), 110);
    },
    crash() {
      noiseBurst(0.3, 0.5, 800);
      blip(90, 0.25, 'square', 0.3, 45);
    },
    missionDone() {
      [523, 659, 784, 1047].forEach((freq, i) => {
        window.setTimeout(() => blip(freq, 0.22, 'triangle', 0.3), i * 130);
      });
    },
    busted() {
      [392, 330, 262].forEach((freq, i) => {
        window.setTimeout(() => blip(freq, 0.3, 'sawtooth', 0.2), i * 200);
      });
    },
    startMusic() {
      if (!ensure() || musicTimer) return;
      musicTimer = window.setInterval(() => {
        if (muted) return;
        const step = musicStep % 8;
        const note = BASS_NOTES[step];
        blip(note, 0.42, 'triangle', 0.22);
        if (step % 2 === 0) noiseBurst(0.04, 0.08, 6000); // hi-hat tick
        if (step === 0 || step === 4) blip(50, 0.18, 'sine', 0.4, 38); // kick
        musicStep += 1;
      }, 460);
    },
    stopMusic() {
      if (musicTimer) {
        window.clearInterval(musicTimer);
        musicTimer = null;
      }
    },
  };
}

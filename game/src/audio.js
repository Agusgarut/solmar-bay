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
  let volume = 0.5;
  let musicStep = 0;
  let stationIndex = 0;

  // Three radio stations, each with its own bass line, tempo and tracks.
  // The HUD shows the station and the track that is playing.
  const STATIONS = [
    {
      name: 'SOLMAR FM', freq: '101.9', genre: 'Chill Pantai',
      notes: [55, 55, 65.41, 55, 49, 55, 82.41, 73.42], tempo: 460,
      tracks: ['Ombak Senja — Lumen Kids', 'Pasir Pagi — The Breakers', 'Senja di Dermaga — Marisol'],
    },
    {
      name: 'WAVE 88.1', freq: '88.1', genre: 'Neon Drive',
      notes: [49, 49, 58.27, 49, 55, 49, 65.41, 58.27], tempo: 420,
      tracks: ['Neon Drive — Pink Horizon', 'Midnight Cruise — Vega Nine', 'Chrome Hearts — Lumen Kids'],
    },
    {
      name: 'BAY ROCK', freq: '94.5', genre: 'Rock Pantai',
      notes: [82.41, 73.42, 65.41, 73.42, 82.41, 98, 82.41, 73.42], tempo: 400,
      tracks: ['Jalan Panas — The Breakers', 'Gas Pol — Marisol', 'Ombak Besar — Vega Nine'],
    },
  ];
  let trackOrder = [0, 1, 2];

  // The bass line of the street loop (A minor, driving).
  const BASS_NOTES = STATIONS[0].notes;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : volume;
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

  // One oscillator note: `slideTo` glides the pitch over the note.
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

  // Filtered noise: gunshots, crashes, tyre screech.
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

  // A note `delay` ms from now, so melodies are written as note lists.
  function later(freq, seconds, type, volume, delayMs, slideTo) {
    window.setTimeout(() => blip(freq, seconds, type, volume, slideTo), delayMs);
  }

  // One step of the music sequencer: bass note on every step, hi-hat tick
  // on even steps, a kick on steps 0 and 4.
  function musicTick() {
    if (muted) return;
    const notes = STATIONS[stationIndex].notes;
    const step = musicStep % 8;
    blip(notes[step], 0.42, 'triangle', 0.22);
    if (step % 2 === 0) noiseBurst(0.04, 0.08, 6000); // hi-hat tick
    if (step === 0 || step === 4) blip(50, 0.18, 'sine', 0.4, 38); // kick
    musicStep += 1;
  }

  return {
    /** Call from any user gesture (start button, key press) to unlock sound. */
    unlock() {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = value ? 0 : volume;
    },
    // Master volume 0..1 (mute keeps working on top of it).
    setVolume(value) {
      volume = Math.max(0, Math.min(1, value));
      if (master) master.gain.value = muted ? 0 : volume;
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
      later(880, 0.45, 'square', 0.05, 450, 660);
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
      later(990, 0.18, 'sine', 0.25, 110);
    },
    crash() {
      noiseBurst(0.3, 0.5, 800);
      blip(90, 0.25, 'square', 0.3, 45);
    },
    // Tyre screech for a handbrake skid.
    skid() {
      noiseBurst(0.28, 0.22, 3200);
    },
    // Two-tone car horn.
    horn() {
      blip(370, 0.22, 'square', 0.12);
      later(466, 0.22, 'square', 0.12, 40);
    },
    missionDone() {
      [523, 659, 784, 1047].forEach((freq, i) => {
        later(freq, 0.22, 'triangle', 0.3, i * 130);
      });
    },
    busted() {
      [392, 330, 262].forEach((freq, i) => {
        later(freq, 0.3, 'sawtooth', 0.2, i * 200);
      });
    },
    startMusic() {
      if (!ensure() || musicTimer) return;
      const station = STATIONS[stationIndex];
      musicTimer = window.setInterval(musicTick, station.tempo);
    },
    stopMusic() {
      if (musicTimer) {
        window.clearInterval(musicTimer);
        musicTimer = null;
      }
    },
    // Radio: which station is on, what track is playing, and switching.
    currentStation() {
      const station = STATIONS[stationIndex];
      const track = station.tracks[trackOrder[musicStep % 3]];
      return { name: station.name, freq: station.freq, genre: station.genre, track, index: stationIndex };
    },
    setStation(index) {
      stationIndex = ((index % STATIONS.length) + STATIONS.length) % STATIONS.length;
      musicStep = 0;
      trackOrder = [0, 1, 2].sort(() => Math.random() - 0.5);
      if (musicTimer) {
        window.clearInterval(musicTimer);
        musicTimer = null;
        this.startMusic();
      }
      return this.currentStation();
    },
    cycleStation() {
      return this.setStation(stationIndex + 1);
    },
  };
}

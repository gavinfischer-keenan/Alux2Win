// ============================================================
// AudioManager.ts — Procedural Web Audio API sounds for LUX
// No audio asset files — all sounds are synthesized at runtime.
// ============================================================

class AudioManager {
  private _ctx: AudioContext | null = null;
  private _masterGain: GainNode | null = null;
  private _volume = 0.6;

  // Ambient drone state
  private _ambientGain: GainNode | null = null;
  private _ambientNodes: OscillatorNode[] = [];
  private _noiseSource: AudioBufferSourceNode | null = null;
  private _shimmerTimeout: ReturnType<typeof setTimeout> | null = null;
  private _lastWarningTime = 0;

  private _ohNoBuffer: AudioBuffer | null = null;
  private _captureBuffer: AudioBuffer | null = null;
  private _shieldDamageBuffer: AudioBuffer | null = null;

  // ── Init ─────────────────────────────────────────────────

  async ensureReady(): Promise<void> {
    if (this._ctx) {
      if (this._ctx.state === 'suspended') {
        await this._ctx.resume();
      }
      return;
    }
    this._ctx = new AudioContext();
    this._masterGain = this._ctx.createGain();
    this._masterGain.gain.setValueAtTime(this._volume, this._ctx.currentTime);
    this._masterGain.connect(this._ctx.destination);
    
    // Load oh_no MP3
    try {
      const response = await fetch('/assets/audio/oh_no.mp3');
      const arrayBuffer = await response.arrayBuffer();
      this._ohNoBuffer = await this._ctx.decodeAudioData(arrayBuffer);
    } catch (err) {
      console.warn('Failed to load oh_no audio', err);
    }

    // Load capture MP3
    try {
      const response = await fetch('/assets/audio/capture.mp3');
      const arrayBuffer = await response.arrayBuffer();
      this._captureBuffer = await this._ctx.decodeAudioData(arrayBuffer);
    } catch (err) {
      console.warn('Failed to load capture audio', err);
    }

    // Load shield damage MP3
    try {
      const response = await fetch('/assets/audio/shield_damage.mp3');
      const arrayBuffer = await response.arrayBuffer();
      this._shieldDamageBuffer = await this._ctx.decodeAudioData(arrayBuffer);
    } catch (err) {
      console.warn('Failed to load shield damage audio', err);
    }

    if (this._ctx.state === 'suspended') {
      await this._ctx.resume();
    }
  }

  setVolume(v: number): void {
    this._volume = Math.max(0, Math.min(1, v));
    if (this._masterGain && this._ctx) {
      this._masterGain.gain.setValueAtTime(this._volume, this._ctx.currentTime);
    }
  }

  // ── Ambient drone ─────────────────────────────────────────

  startAmbient(): void {
    const ctx = this._ctx;
    const master = this._masterGain;
    if (!ctx || !master) return;
    if (this._ambientGain) return; // already running

    const ambGain = ctx.createGain();
    ambGain.gain.setValueAtTime(0, ctx.currentTime);
    ambGain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 2.0);
    ambGain.connect(master);
    this._ambientGain = ambGain;

    // Sub-bass drone — 45 Hz triangle
    const subOsc = ctx.createOscillator();
    subOsc.type = 'triangle';
    subOsc.frequency.setValueAtTime(45, ctx.currentTime);
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.6, ctx.currentTime);
    subOsc.connect(subGain);
    subGain.connect(ambGain);
    subOsc.start();
    this._ambientNodes.push(subOsc);

    // Harmonic — 90 Hz triangle
    const harmOsc = ctx.createOscillator();
    harmOsc.type = 'triangle';
    harmOsc.frequency.setValueAtTime(90, ctx.currentTime);
    const harmGain = ctx.createGain();
    harmGain.gain.setValueAtTime(0.25, ctx.currentTime);
    harmOsc.connect(harmGain);
    harmGain.connect(ambGain);
    harmOsc.start();
    this._ambientNodes.push(harmOsc);

    // Looping noise buffer — bandpassed at 250 Hz
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    const bpFilter = ctx.createBiquadFilter();
    bpFilter.type = 'bandpass';
    bpFilter.frequency.setValueAtTime(250, ctx.currentTime);
    bpFilter.Q.setValueAtTime(1.5, ctx.currentTime);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.08, ctx.currentTime);

    noiseSource.connect(bpFilter);
    bpFilter.connect(noiseGain);
    noiseGain.connect(ambGain);
    noiseSource.start();
    this._noiseSource = noiseSource;

    // Schedule shimmer tones
    this._scheduleShimmer();
  }

  stopAmbient(): void {
    const ctx = this._ctx;
    if (!ctx) return;

    // Cancel scheduled shimmer
    if (this._shimmerTimeout !== null) {
      clearTimeout(this._shimmerTimeout);
      this._shimmerTimeout = null;
    }

    const ambGain = this._ambientGain;
    if (!ambGain) return;

    // Fade out over 1.5s
    ambGain.gain.setValueAtTime(ambGain.gain.value, ctx.currentTime);
    ambGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.5);

    const nodesToStop = [...this._ambientNodes];
    const noiseToStop = this._noiseSource;

    // Clear references immediately so shimmer check fails
    this._ambientGain = null;
    this._ambientNodes = [];
    this._noiseSource = null;

    // Stop nodes after fade completes
    setTimeout(() => {
      nodesToStop.forEach(n => {
        try { n.stop(); } catch { /* already stopped */ }
      });
      if (noiseToStop) {
        try { noiseToStop.stop(); } catch { /* already stopped */ }
      }
      try { ambGain.disconnect(); } catch { /* already disconnected */ }
    }, 1600);
  }

  private _scheduleShimmer(): void {
    // Random interval between 4 and 12 seconds
    const delay = 4000 + Math.random() * 8000;
    this._shimmerTimeout = setTimeout(() => {
      this._shimmerTimeout = null;
      // Only play if ambient is still alive
      if (!this._ambientGain || !this._ctx) return;
      this._playShimmerTone();
      this._scheduleShimmer(); // reschedule
    }, delay);
  }

  private _playShimmerTone(): void {
    const ctx = this._ctx;
    const ambGain = this._ambientGain;
    if (!ctx || !ambGain) return;

    // Pick a random shimmer frequency from a pentatonic-ish set
    const freqs = [220, 277, 330, 415, 554, 660, 830];
    const freq = freqs[Math.floor(Math.random() * freqs.length)];

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.0);

    osc.connect(gain);
    gain.connect(ambGain);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 2.1);
  }

  // ── Sound effects ─────────────────────────────────────────

  playLaunch(): void {
    const ctx = this._ctx;
    const master = this._masterGain;
    if (!ctx || !master) return;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.12);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.22, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

    osc.connect(gain);
    gain.connect(master);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.13);
  }

  playCapture(faction: string): void {
    const ctx = this._ctx;
    const master = this._masterGain;
    if (!ctx || !master) return;

    const freqMap: Record<string, number> = {
      player:  523,
      enemy_a: 330,
      enemy_b: 392,
      neutral: 262,
    };
    const baseFreq = freqMap[faction] ?? 392;
    const harmonics = [baseFreq, baseFreq * 1.5];

    harmonics.forEach((freq, idx) => {
      const startTime = ctx.currentTime + idx * 0.08;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.18, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.6);

      osc.connect(gain);
      gain.connect(master);
      osc.start(startTime);
      osc.stop(startTime + 0.65);
    });
  }

  playGameOver(won: boolean): void {
    const ctx = this._ctx;
    const master = this._masterGain;
    if (!ctx || !master) return;

    if (won) {
      // Rising C4-E4-G4-C5 arpeggio
      const freqs = [262, 330, 392, 523];
      const noteDuration = 0.15;
      freqs.forEach((freq, i) => {
        const startTime = ctx.currentTime + i * noteDuration;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.25, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + noteDuration + 0.3);

        osc.connect(gain);
        gain.connect(master);
        osc.start(startTime);
        osc.stop(startTime + noteDuration + 0.35);
      });
    } else {
      // Falling A4-F4-D4-A3 arpeggio
      const freqs = [440, 349, 294, 220];
      const noteDuration = 0.2;
      freqs.forEach((freq, i) => {
        const startTime = ctx.currentTime + i * noteDuration;
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, startTime);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.22, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + noteDuration + 0.4);

        osc.connect(gain);
        gain.connect(master);
        osc.start(startTime);
        osc.stop(startTime + noteDuration + 0.45);
      });
    }
  }

  playSelect(): void {
    const ctx = this._ctx;
    const master = this._masterGain;
    if (!ctx || !master) return;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.05);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(master);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.06);
  }

  playCommand(): void {
    const ctx = this._ctx;
    const master = this._masterGain;
    if (!ctx || !master) return;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.1);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);

    osc.connect(gain);
    gain.connect(master);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.11);
  }

  playUpgrade(isPlayer: boolean): void {
    const ctx = this._ctx;
    const master = this._masterGain;
    if (!ctx || !master || !isPlayer) return;

    const freqs = [440, 554, 659, 880];
    freqs.forEach((freq, i) => {
      const startTime = ctx.currentTime + i * 0.1;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.15, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);

      osc.connect(gain);
      gain.connect(master);
      osc.start(startTime);
      osc.stop(startTime + 0.35);
    });
  }

  playWarning(): void {
    const ctx = this._ctx;
    const master = this._masterGain;
    if (!ctx || !master) return;

    if (ctx.currentTime - this._lastWarningTime < 3.0) return; // Throttle to every 3s
    this._lastWarningTime = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(250, ctx.currentTime);
    osc.frequency.setValueAtTime(200, ctx.currentTime + 0.1);
    osc.frequency.setValueAtTime(250, ctx.currentTime + 0.2);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

    osc.connect(gain);
    gain.connect(master);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.45);
  }

  playClick(): void {
    const ctx = this._ctx;
    const master = this._masterGain;
    if (!ctx || !master) return;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.05);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(master);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.06);
  }

  // ── Hazard Death Voices ───────────────────────────────────

  /** "Oh Nooooo" — played once per planet destroyed by a hazard. */
  playPlanetHazardDeath(): void {
    const ctx = this._ctx;
    const master = this._masterGain;
    if (!ctx || !master || !this._ohNoBuffer) return;

    const source = ctx.createBufferSource();
    source.buffer = this._ohNoBuffer;
    
    const g = ctx.createGain();
    g.gain.value = 1.0;
    source.connect(g);
    g.connect(master);
    
    source.start();
  }

  /** Played when the player successfully captures a planet. */
  playPlanetCapture(): void {
    const ctx = this._ctx;
    const master = this._masterGain;
    if (!ctx || !master || !this._captureBuffer) return;

    const source = ctx.createBufferSource();
    source.buffer = this._captureBuffer;
    
    const g = ctx.createGain();
    g.gain.value = 1.0;
    source.connect(g);
    g.connect(master);
    
    source.start();
  }

  /** Played when a player's shielded planet takes damage. */
  private _lastShieldDamageTime = -Infinity;

  playShieldDamage(): void {
    const ctx = this._ctx;
    const master = this._masterGain;
    if (!ctx || !master || !this._shieldDamageBuffer) return;
    if (ctx.currentTime - this._lastShieldDamageTime < 2.0) return; // 2s cooldown
    this._lastShieldDamageTime = ctx.currentTime;

    const source = ctx.createBufferSource();
    source.buffer = this._shieldDamageBuffer;
    
    const g = ctx.createGain();
    g.gain.value = 1.0;
    source.connect(g);
    g.connect(master);
    
    source.start();
  }

  /** "We regret to inform you" monotone — played at most once per 3s window. */
  private _lastRegretTime = -Infinity;

  playParticleHazardDeath(): void {
    const ctx = this._ctx;
    const master = this._masterGain;
    if (!ctx || !master) return;
    if (ctx.currentTime - this._lastRegretTime < 3.0) return; // 3s cooldown
    this._lastRegretTime = ctx.currentTime;

    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 2.5);
    g.connect(master);

    // Deep monotone — flat syllable pulses at ~120Hz
    const syllableTimings = [0, 0.22, 0.45, 0.65, 0.85, 1.05, 1.3, 1.55, 1.78, 2.0];
    const baseFreq = 110;
    syllableTimings.forEach((st) => {
      const osc = ctx.createOscillator();
      const og  = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(baseFreq, t + st);
      og.gain.setValueAtTime(0.0, t + st);
      og.gain.linearRampToValueAtTime(0.9, t + st + 0.02);
      og.gain.setValueAtTime(0.9, t + st + 0.12);
      og.gain.linearRampToValueAtTime(0.0, t + st + 0.18);
      osc.connect(og); og.connect(g);
      osc.start(t + st);
      osc.stop(t + st + 0.22);
    });
  }

  // ── Cleanup ───────────────────────────────────────────────

  destroy(): void {
    this.stopAmbient();
    setTimeout(() => {
      if (this._ctx) {
        this._ctx.close().catch(() => { /* ignore */ });
        this._ctx = null;
        this._masterGain = null;
      }
    }, 1700);
  }
}

export const audioManager = new AudioManager();

// Synthesized sound engine using the Web Audio API — zero external asset dependencies.
// Gracefully handles audio context creation upon first user interaction and persists mute state.

class SoundManager {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;
  private masterGain: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineRunning: boolean = false;

  constructor() {
    this.muted = localStorage.getItem("ab_line_muted") === "true";
  }

  private initContext(): void {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.muted ? 0 : 0.4, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public toggleMute(): boolean {
    this.initContext();
    this.muted = !this.muted;
    localStorage.setItem("ab_line_muted", String(this.muted));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : 0.4, this.ctx.currentTime, 0.05);
    }
    return this.muted;
  }

  // --- Tractor Engine Hum (continuous pitch modulated by champion speed) ---
  public updateEngine(speedFraction: number, isSimRunning: boolean): void {
    if (this.muted || !isSimRunning) {
      if (this.engineRunning) this.stopEngine();
      return;
    }

    this.initContext();
    if (!this.ctx || !this.masterGain) return;

    if (!this.engineRunning) {
      this.startEngine();
    }

    if (this.engineOsc && this.engineGain && this.ctx) {
      // 45Hz at idle, up to 135Hz at full throttle (low rumble of a diesel tractor)
      const targetFreq = 45 + speedFraction * 90;
      const targetVol = 0.04 + speedFraction * 0.07;
      this.engineOsc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.1);
      this.engineGain.gain.setTargetAtTime(targetVol, this.ctx.currentTime, 0.1);
    }
  }

  private startEngine(): void {
    if (!this.ctx || !this.masterGain || this.engineRunning) return;
    try {
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = "sawtooth";
      this.engineOsc.frequency.setValueAtTime(45, this.ctx.currentTime);

      // Low-pass filter to make it sound like a throaty diesel engine rather than a harsh buzz
      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(220, this.ctx.currentTime);

      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.setValueAtTime(0.04, this.ctx.currentTime);

      this.engineOsc.connect(filter);
      filter.connect(this.engineGain);
      this.engineGain.connect(this.masterGain);

      this.engineOsc.start();
      this.engineRunning = true;
    } catch {
      // Ignore audio initiation before interaction
    }
  }

  private stopEngine(): void {
    if (this.engineOsc) {
      try {
        this.engineOsc.stop();
        this.engineOsc.disconnect();
      } catch {
        // Safe disconnect
      }
      this.engineOsc = null;
    }
    this.engineRunning = false;
  }

  // --- UI & Event Sound Effects ---
  public playClick(): void {
    if (this.muted) return;
    this.initContext();
    if (!this.ctx || !this.masterGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(800, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, this.ctx.currentTime + 0.04);
    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.04);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.04);
  }

  public playPurchase(): void {
    if (this.muted) return;
    this.initContext();
    if (!this.ctx || !this.masterGain) return;

    // Pleasant two-tone ascending cash chime
    const now = this.ctx.currentTime;
    [523.25, 783.99].forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, now + idx * 0.07);
      gain.gain.setValueAtTime(0.2, now + idx * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.18);

      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now + idx * 0.07);
      osc.stop(now + idx * 0.07 + 0.18);
    });
  }

  public playMilestone(): void {
    if (this.muted) return;
    this.initContext();
    if (!this.ctx || !this.masterGain) return;

    // Major triad victory chord (C - E - G - C)
    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);
      gain.gain.setValueAtTime(0.18, now + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.35);

      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.35);
    });
  }

  public playCrash(): void {
    if (this.muted) return;
    this.initContext();
    if (!this.ctx || !this.masterGain) return;

    // Soft low-frequency thud with noise
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.15);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  public playMud(): void {
    if (this.muted) return;
    this.initContext();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.1);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.1);
  }
}

export const sound = new SoundManager();

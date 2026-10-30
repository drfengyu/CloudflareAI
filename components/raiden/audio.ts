/**
 * 雷电行动的合成音效。不加载任何外部音频文件，全部用 WebAudio 现场合成，
 * 首次用户手势（开局点击/按键）后才创建 AudioContext，避免被浏览器挂起。
 */

export type SfxName =
  | "shoot"
  | "laser"
  | "shell"
  | "missile"
  | "shuffle"
  | "hit"
  | "explode"
  | "bigExplode"
  | "bomb"
  | "powerup"
  | "coin"
  | "warning"
  | "stageClear"
  | "gameOver"
  | "revive"
  | "beam";

export class RaidenAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private lastShot = 0;

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.32, this.ctx.currentTime, 0.01);
    }
  }

  /** 在用户手势里调用，创建/恢复音频上下文。 */
  unlock(): void {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.32;
      this.master.connect(this.ctx.destination);
      this.noiseBuffer = this.makeNoise(this.ctx);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  close(): void {
    if (this.ctx) {
      void this.ctx.close().catch(() => undefined);
      this.ctx = null;
      this.master = null;
    }
  }

  play(name: SfxName): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || this.muted || ctx.state !== "running") return;
    const now = ctx.currentTime;
    switch (name) {
      case "shoot":
        if (now - this.lastShot < 0.085) return;
        this.lastShot = now;
        this.tone(ctx, master, "square", 980, 320, 0.055, 0.045, now);
        break;
      case "laser":
        this.tone(ctx, master, "sawtooth", 1500, 520, 0.11, 0.035, now);
        break;
      case "shell":
        this.noise(ctx, master, 0.13, 0.07, 1200, 260, now);
        this.tone(ctx, master, "square", 260, 120, 0.12, 0.04, now);
        break;
      case "missile":
        this.noise(ctx, master, 0.24, 0.05, 600, 2600, now);
        this.tone(ctx, master, "sine", 300, 700, 0.2, 0.03, now);
        break;
      case "shuffle":
        this.tone(ctx, master, "triangle", 640, 1180, 0.06, 0.045, now);
        break;
      case "hit":
        this.tone(ctx, master, "triangle", 320, 180, 0.04, 0.03, now);
        break;
      case "explode":
        this.noise(ctx, master, 0.22, 0.16, 1800, 300, now);
        this.tone(ctx, master, "sine", 160, 50, 0.22, 0.12, now);
        break;
      case "bigExplode":
        this.noise(ctx, master, 0.65, 0.3, 2200, 120, now);
        this.tone(ctx, master, "sine", 120, 32, 0.7, 0.22, now);
        break;
      case "bomb":
        this.noise(ctx, master, 0.9, 0.28, 900, 80, now);
        this.tone(ctx, master, "sawtooth", 60, 320, 0.5, 0.12, now);
        this.tone(ctx, master, "sine", 420, 60, 0.8, 0.14, now + 0.05);
        break;
      case "powerup":
        this.tone(ctx, master, "square", 520, 520, 0.07, 0.07, now);
        this.tone(ctx, master, "square", 780, 780, 0.07, 0.07, now + 0.07);
        this.tone(ctx, master, "square", 1040, 1040, 0.1, 0.07, now + 0.14);
        break;
      case "coin":
        this.tone(ctx, master, "square", 1180, 1600, 0.07, 0.05, now);
        break;
      case "warning":
        this.tone(ctx, master, "sawtooth", 420, 420, 0.18, 0.08, now);
        this.tone(ctx, master, "sawtooth", 300, 300, 0.18, 0.08, now + 0.22);
        this.tone(ctx, master, "sawtooth", 420, 420, 0.18, 0.08, now + 0.44);
        this.tone(ctx, master, "sawtooth", 300, 300, 0.18, 0.08, now + 0.66);
        break;
      case "stageClear":
        [523, 659, 784, 1047].forEach((freq, i) => {
          this.tone(ctx, master, "triangle", freq, freq, 0.16, 0.1, now + i * 0.13);
        });
        break;
      case "gameOver":
        [392, 330, 262, 196].forEach((freq, i) => {
          this.tone(ctx, master, "triangle", freq, freq, 0.24, 0.1, now + i * 0.18);
        });
        break;
      case "revive":
        this.tone(ctx, master, "sawtooth", 180, 720, 0.35, 0.08, now);
        this.tone(ctx, master, "triangle", 720, 1080, 0.18, 0.08, now + 0.28);
        break;
      case "beam":
        this.tone(ctx, master, "sawtooth", 1200, 200, 0.5, 0.06, now);
        this.noise(ctx, master, 0.5, 0.1, 3200, 800, now);
        break;
    }
  }

  private makeNoise(ctx: AudioContext): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * 1.2);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private tone(
    ctx: AudioContext,
    master: GainNode,
    type: OscillatorType,
    from: number,
    to: number,
    duration: number,
    volume: number,
    at: number,
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, from), at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + duration);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(gain).connect(master);
    osc.start(at);
    osc.stop(at + duration + 0.03);
  }

  private noise(
    ctx: AudioContext,
    master: GainNode,
    duration: number,
    volume: number,
    filterFreq: number,
    filterEnd: number,
    at: number,
  ): void {
    if (!this.noiseBuffer) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(filterFreq, at);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, filterEnd), at + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(at);
    source.stop(at + duration + 0.05);
  }
}

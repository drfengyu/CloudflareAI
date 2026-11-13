/**
 * 活动小游戏的背景音乐与音效：全部用 Web Audio 现场合成，不打包任何音频素材。
 *
 * 音乐默认关闭，开关状态记在 localStorage；开启必须由玩家在活动页点按钮并二次确认。
 * 音频上下文只在用户手势里创建 / 恢复，SSR 阶段不碰 window。
 */

export type GameSfx =
  | "hit"
  | "crit"
  | "cast"
  | "heal"
  | "guard"
  | "miss"
  | "down"
  | "capture"
  | "flee"
  | "win"
  | "lose"
  | "encounter"
  | "coin"
  | "click";

export type GameTheme = "trial-field" | "trial-battle" | "workshop-field" | "workshop-battle";

interface ThemeDef {
  bpm: number;
  wave: OscillatorType;
  /** 16 步循环，MIDI 音高，0 表示这一拍不响。 */
  bass: number[];
  lead: number[];
}

const THEMES: Record<GameTheme, ThemeDef> = {
  // 行军：五声音阶，慢速铺底，像赶路时的鼓点与笛声。
  "trial-field": {
    bpm: 92,
    wave: "sine",
    bass: [38, 0, 0, 0, 45, 0, 0, 0, 43, 0, 0, 0, 41, 0, 0, 0],
    lead: [62, 0, 64, 0, 67, 0, 64, 0, 62, 0, 60, 0, 62, 0, 0, 0],
  },
  // 交战：小调快板，低音每拍推进。
  "trial-battle": {
    bpm: 144,
    wave: "square",
    bass: [40, 40, 0, 40, 43, 0, 40, 0, 38, 38, 0, 38, 36, 0, 38, 0],
    lead: [64, 0, 67, 0, 71, 0, 67, 0, 64, 0, 62, 0, 60, 0, 62, 0],
  },
  // 工坊野外：轻快的大调，适合在地图上遛灵宠。
  "workshop-field": {
    bpm: 106,
    wave: "triangle",
    bass: [41, 0, 0, 0, 48, 0, 0, 0, 46, 0, 0, 0, 43, 0, 0, 0],
    lead: [65, 67, 69, 0, 72, 0, 69, 0, 67, 65, 64, 0, 65, 0, 0, 0],
  },
  // 工坊战斗：半音逼近，节奏更密。
  "workshop-battle": {
    bpm: 150,
    wave: "sawtooth",
    bass: [36, 36, 0, 36, 39, 0, 36, 0, 41, 0, 39, 0, 36, 0, 34, 0],
    lead: [60, 63, 65, 0, 67, 0, 65, 63, 60, 0, 63, 0, 65, 0, 67, 0],
  },
};

const STORAGE_KEY = "cloudai:game-audio";

const midiHz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

const clampGain = (value: number): number => Math.min(0.3, Math.max(0.001, value));

class GameAudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private enabled = false;
  private loaded = false;
  private theme: GameTheme | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextTime = 0;
  private step = 0;
  private pendingUnlock = false;
  private listeners = new Set<() => void>();

  isEnabled(): boolean {
    this.load();
    return this.enabled;
  }

  /** 给 useSyncExternalStore 用：服务端快照固定 false，hydration 后再读本地偏好。 */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): boolean => this.isEnabled();

  setEnabled(on: boolean): void {
    this.load();
    this.enabled = on;
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
      } catch {
        // 隐私模式下写不了 localStorage，本次会话内仍然生效。
      }
    }
    if (on) {
      this.ensureContext();
      this.startLoop();
    } else {
      this.stopLoop();
    }
    for (const listener of this.listeners) listener();
  }

  setTheme(theme: GameTheme | null): void {
    if (theme === this.theme) return;
    this.theme = theme;
    if (!this.enabled) return;
    if (theme) this.startLoop();
    else this.stopLoop();
  }

  /** 刷新后沿用上次的开启状态：第一次点击 / 按键时再把音频上下文拉起来。 */
  unlockOnGesture(): void {
    if (typeof window === "undefined" || !this.enabled || this.pendingUnlock) return;
    if (this.ctx?.state === "running") return;
    this.pendingUnlock = true;
    const unlock = () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      this.pendingUnlock = false;
      if (!this.enabled) return;
      this.ensureContext();
      this.startLoop();
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
  }

  play(sfx: GameSfx): void {
    this.load();
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime + 0.01;
    switch (sfx) {
      case "hit":
        this.noiseBurst(t, 0.11, 0.14);
        this.blip(t, 240, 90, 0.13, "square", 0.1);
        break;
      case "crit":
        this.noiseBurst(t, 0.16, 0.18);
        this.blip(t, 330, 80, 0.2, "sawtooth", 0.11);
        this.blip(t + 0.07, 520, 120, 0.14, "square", 0.08);
        break;
      case "cast":
        this.blip(t, 320, 880, 0.3, "sine", 0.08);
        this.blip(t + 0.05, 640, 1180, 0.24, "triangle", 0.05);
        break;
      case "heal":
        this.note(t, 660, 0.12, "sine", 0.08);
        this.note(t + 0.1, 880, 0.18, "sine", 0.07);
        break;
      case "guard":
        this.blip(t, 170, 90, 0.16, "triangle", 0.11);
        this.noiseBurst(t, 0.05, 0.05);
        break;
      case "miss":
        this.blip(t, 900, 1400, 0.12, "sine", 0.05);
        break;
      case "down":
        this.blip(t, 260, 55, 0.42, "sawtooth", 0.09);
        this.noiseBurst(t + 0.05, 0.2, 0.07);
        break;
      case "capture":
        [523, 659, 784].forEach((freq, index) =>
          this.note(t + index * 0.11, freq, 0.14, "square", 0.05),
        );
        break;
      case "flee":
        this.blip(t, 520, 180, 0.22, "triangle", 0.07);
        break;
      case "win":
        [523, 659, 784, 1046].forEach((freq, index) =>
          this.note(t + index * 0.12, freq, 0.24, "square", 0.06),
        );
        break;
      case "lose":
        [330, 294, 262, 196].forEach((freq, index) =>
          this.note(t + index * 0.16, freq, 0.3, "triangle", 0.07),
        );
        break;
      case "encounter":
        this.note(t, 880, 0.1, "square", 0.06);
        this.note(t + 0.13, 1174, 0.12, "square", 0.06);
        break;
      case "coin":
        this.note(t, 1318, 0.07, "square", 0.045);
        this.note(t + 0.07, 1760, 0.1, "square", 0.045);
        break;
      case "click":
        this.note(t, 700, 0.05, "sine", 0.035);
        break;
      default:
        break;
    }
  }

  private load(): void {
    if (this.loaded || typeof window === "undefined") return;
    this.loaded = true;
    try {
      this.enabled = window.localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      this.enabled = false;
    }
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.85;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume().catch(() => undefined);
    }
    return this.ctx;
  }

  private startLoop(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.theme || !this.enabled) return;
    this.stopLoop(true);
    this.nextTime = ctx.currentTime + 0.08;
    this.step = 0;
    this.timer = setInterval(() => this.pump(), 90);
    this.pump();
  }

  private stopLoop(reset = true): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (reset) {
      this.step = 0;
      this.nextTime = 0;
    }
  }

  private pump(): void {
    const ctx = this.ctx;
    const theme = this.theme ? THEMES[this.theme] : null;
    if (!ctx || !theme || !this.enabled) return;
    const stepDur = 60 / theme.bpm / 2;
    let guard = 0;
    while (this.nextTime < ctx.currentTime + 0.25 && guard < 16) {
      this.scheduleStep(theme, this.step % 16, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step += 1;
      guard += 1;
    }
  }

  private scheduleStep(theme: ThemeDef, step: number, at: number, dur: number): void {
    const bass = theme.bass[step] ?? 0;
    if (bass > 0) this.note(at, midiHz(bass), dur * 0.9, "triangle", 0.075);
    const lead = theme.lead[step] ?? 0;
    if (lead > 0) this.note(at, midiHz(lead), dur * 0.75, theme.wave, 0.032);
    if (step % 8 === 0) this.noiseBurst(at, 0.03, 0.02);
  }

  private note(
    at: number,
    freq: number,
    dur: number,
    type: OscillatorType,
    gain: number,
  ): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(clampGain(gain), at + 0.015);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(env);
    env.connect(master);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }

  private blip(
    at: number,
    from: number,
    to: number,
    dur: number,
    type: OscillatorType,
    gain: number,
  ): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + dur);
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(clampGain(gain), at + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(env);
    env.connect(master);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }

  private noiseBurst(at: number, dur: number, gain: number): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    if (!this.noise) {
      const length = Math.floor(ctx.sampleRate * 0.25);
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let index = 0; index < length; index++) data[index] = Math.random() * 2 - 1;
      this.noise = buffer;
    }
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const env = ctx.createGain();
    env.gain.setValueAtTime(clampGain(gain), at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1800;
    source.connect(filter);
    filter.connect(env);
    env.connect(master);
    source.start(at);
    source.stop(at + dur + 0.02);
  }
}

export const gameAudio = new GameAudioEngine();

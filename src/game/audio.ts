export class SurgicalAudio {
  context: AudioContext | null = null;
  enabled = false;
  lastBeat = 0;
  suction: OscillatorNode | null = null;
  gain: GainNode | null = null;
  setEnabled(value: boolean) {
    this.enabled = value;
    if (value) {
      this.context ??= new AudioContext();
      void this.context.resume();
    } else if (this.gain)
      this.gain.gain.setTargetAtTime(0, this.context!.currentTime, 0.03);
  }
  update(
    time: number,
    active: boolean,
    tool: string,
    running: boolean,
    hr = 72,
    critical = false,
    dead = false,
    bleeding = 0,
    spo2 = 99,
  ) {
    if (!this.enabled || !this.context) return;
    const ctx = this.context;
    this.texture(time, active, tool, running, dead, bleeding);
    if (running && !dead && time - this.lastBeat > 60 / Math.max(40, hr)) {
      this.lastBeat = time;
      const oscillator = ctx.createOscillator(),
        gain = ctx.createGain();
      oscillator.type = "sine";
      // Pulse-oximeter tone: the pitch drops as oxygen falls.
      oscillator.frequency.value = 330 + Math.max(0, Math.min(1, (spo2 - 80) / 19)) * 520 + (critical ? 80 : 0);
      gain.gain.setValueAtTime(critical ? 0.06 : 0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.075);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.085);
    }
    if (!this.suction) {
      this.suction = ctx.createOscillator();
      this.suction.type = "triangle";
      this.suction.frequency.value = 105;
      this.gain = ctx.createGain();
      this.gain.gain.value = 0;
      this.suction.connect(this.gain);
      this.gain.connect(ctx.destination);
      this.suction.start();
    }
    this.suction.frequency.setTargetAtTime(
      tool === "drill"
        ? 520
        : tool === "bipolar"
          ? 220
          : tool === "irrigation"
            ? 180
            : 105,
      ctx.currentTime,
      0.08,
    );
    this.gain!.gain.setTargetAtTime(
      active && running ? 0.012 : 0,
      ctx.currentTime,
      0.06,
    );
  }
  noise: GainNode | null = null;
  noiseFilter: BiquadFilterNode | null = null;
  flat: OscillatorNode | null = null;
  flatGain: GainNode | null = null;
  lastBreath = 0;
  flatSince = 0;
  hum: GainNode | null = null;
  /** Wet, textured sound under the instruments, a ventilator, and a flatline on death. */
  texture(time: number, active: boolean, tool: string, running: boolean, dead: boolean, bleeding: number) {
    const ctx = this.context!;
    if (!this.noise) {
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate),
        data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      this.noiseFilter = ctx.createBiquadFilter();
      this.noise = ctx.createGain();
      this.noise.gain.value = 0;
      src.connect(this.noiseFilter);
      this.noiseFilter.connect(this.noise);
      this.noise.connect(ctx.destination);
      src.start();
    }
    // Fluorescent mains hum: always there, slightly unsteady, occasionally dips.
    if (!this.hum) {
      this.hum = ctx.createGain();
      this.hum.gain.value = 0;
      this.hum.connect(ctx.destination);
      for (const [freq, level] of [[50, 1], [100, 0.55], [150, 0.18]] as const) {
        const o = ctx.createOscillator(),
          g = ctx.createGain();
        o.type = "sine";
        o.frequency.value = freq;
        g.gain.value = level;
        o.connect(g);
        g.connect(this.hum);
        o.start();
      }
    }
    this.hum.gain.setTargetAtTime(
      dead ? 0.004 : 0.011 + 0.004 * Math.sin(time * 0.8) + (Math.random() > 0.992 ? -0.008 : 0),
      ctx.currentTime,
      0.08,
    );
    const f = this.noiseFilter!;
    const wet = tool === "suction";
    f.type = tool === "irrigation" ? "highpass" : wet ? "lowpass" : "bandpass";
    f.frequency.setTargetAtTime(
      tool === "irrigation" ? 3200 : wet ? 520 + Math.random() * 380 : tool === "drill" ? 1700 : 4200,
      ctx.currentTime,
      0.03,
    );
    const level =
      active && running
        ? tool === "bipolar"
          ? 0.02 * (Math.random() > 0.55 ? 1 : 0.1)
          : tool === "drill"
            ? 0.03
            : 0.024
        : bleeding > 0.3 && running
          ? 0.006
          : 0;
    this.noise!.gain.setTargetAtTime(dead ? 0 : level, ctx.currentTime, 0.05);
    if (running && time - this.lastBreath > 4.2) {
      this.lastBreath = time;
      const len = 1.5,
        buffer = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate),
        d = buffer.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const s = ctx.createBufferSource(),
        bp = ctx.createBiquadFilter(),
        g = ctx.createGain();
      s.buffer = buffer;
      bp.type = "bandpass";
      bp.frequency.value = 700;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.014, ctx.currentTime + 0.6);
      g.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + len);
      s.connect(bp);
      bp.connect(g);
      g.connect(ctx.destination);
      s.start();
    }
    if (dead && !this.flat) {
      this.flat = ctx.createOscillator();
      this.flat.type = "sine";
      this.flat.frequency.value = 880;
      this.flatGain = ctx.createGain();
      this.flatGain.gain.value = 0.035;
      this.flat.connect(this.flatGain);
      this.flatGain.connect(ctx.destination);
      this.flat.start();
      this.flatSince = time;
    } else if (dead && this.flat && this.flatGain && time - this.flatSince > 4) {
      this.flatGain.gain.setTargetAtTime(0, ctx.currentTime, 0.8);
    } else if (!dead && this.flat) {
      this.flat.stop();
      this.flat = null;
    }
  }
  dispose() {
    this.suction?.stop();
    void this.context?.close();
  }
}

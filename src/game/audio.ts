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
  update(time: number, active: boolean, tool: string, running: boolean) {
    if (!this.enabled || !this.context) return;
    const ctx = this.context;
    if (running && time - this.lastBeat > 0.83) {
      this.lastBeat = time;
      const oscillator = ctx.createOscillator(),
        gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 780;
      gain.gain.setValueAtTime(0.018, ctx.currentTime);
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
  dispose() {
    this.suction?.stop();
    void this.context?.close();
  }
}

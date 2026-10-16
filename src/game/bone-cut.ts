// Material removal in a regular height field. This is game-scale carving, not
// a finite-element model: bone does not elastically deform under the burr.
export const CUT_RX = 1.31,
  CUT_RY = 1.08;
export class BoneCut {
  readonly columns = 128;
  readonly rows = 108;
  readonly width = 3.8;
  readonly height = 3.2;
  readonly damage = new Float32Array((this.columns + 1) * (this.rows + 1));
  readonly path = Array.from({ length: 80 }, (_, i) => {
    const a = (i / 80) * Math.PI * 2;
    return { x: Math.cos(a) * CUT_RX, y: Math.sin(a) * CUT_RY };
  });
  x(i: number) {
    return (
      ((i % (this.columns + 1)) / this.columns) * this.width - this.width / 2
    );
  }
  y(i: number) {
    return (
      (Math.floor(i / (this.columns + 1)) / this.rows) * this.height -
      this.height / 2
    );
  }
  at(x: number, y: number) {
    const col = Math.max(
        0,
        Math.min(
          this.columns,
          Math.round((x / this.width + 0.5) * this.columns),
        ),
      ),
      row = Math.max(
        0,
        Math.min(this.rows, Math.round((y / this.height + 0.5) * this.rows)),
      );
    return this.damage[row * (this.columns + 1) + col];
  }
  get progress() {
    return (
      this.path.filter((p) => this.at(p.x, p.y) > 0.82).length /
      this.path.length
    );
  }
  carve(x: number, y: number, dt: number) {
    let changed = false;
    const radius = 0.115;
    const col = Math.round((x / this.width + 0.5) * this.columns),
      row = Math.round((y / this.height + 0.5) * this.rows);
    for (let j = Math.max(0, row - 5); j <= Math.min(this.rows, row + 5); j++)
      for (
        let k = Math.max(0, col - 5);
        k <= Math.min(this.columns, col + 5);
        k++
      ) {
        const i = j * (this.columns + 1) + k,
          d = Math.hypot(this.x(i) - x, this.y(i) - y);
        if (d >= radius) continue;
        const next = Math.min(
          1,
          this.damage[i] + Math.max(0, dt) * 7 * Math.pow(1 - d / radius, 0.55),
        );
        if (next !== this.damage[i]) {
          this.damage[i] = next;
          changed = true;
        }
      }
    return changed;
  }
  reset() {
    this.damage.fill(0);
  }
}

/**
 * One cheap post pass: radial chromatic aberration, film grain, vignette and a
 * mood grade that drains colour (but keeps the reds) as the patient crashes.
 */
export const gradeShader = {
  name: "SutureGrade",
  uniforms: {
    tDiffuse: { value: null as unknown },
    uTime: { value: 0 },
    uCrisis: { value: 0 },
    uAberration: { value: 0.0012 },
    uBlood: { value: 0 },
    tSplat: { value: null as unknown },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uCrisis, uAberration, uBlood;
    uniform sampler2D tSplat;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 off = c * r2 * uAberration * 18.0;
      vec3 col = vec3(
        texture2D(tDiffuse, vUv + off).r,
        texture2D(tDiffuse, vUv).g,
        texture2D(tDiffuse, vUv - off).b
      );
      // Blood on the lens: drops that bend the view slightly and tint it dark red.
      float splat = texture2D(tSplat, vUv).r * uBlood;
      col = mix(col, texture2D(tDiffuse, vUv + (vec2(0.5) - vUv) * 0.025 * splat).rgb * vec3(0.55, 0.12, 0.1), clamp(splat * 1.3, 0.0, 0.88));
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      // Crisis: desaturate everything except red, so blood stays vivid while the room greys.
      float redness = clamp((col.r - max(col.g, col.b)) * 3.0, 0.0, 1.0);
      float keep = 1.0 - uCrisis * 0.55 * (1.0 - redness * 0.8);
      col = mix(vec3(lum), col, keep);
      // Cool shadows, warm highlights; shadows go venous as things get worse.
      col += (1.0 - lum) * mix(vec3(-0.004, 0.004, 0.006), vec3(0.03, -0.004, -0.004), uCrisis) * 0.5;
      col *= mix(1.0, 1.06, uCrisis);
      float vig = smoothstep(0.95, 0.25, r2 * (1.2 + uCrisis * 1.1));
      col *= mix(1.0, vig, 0.45 + uCrisis * 0.4);
      col += (hash(vUv * 900.0) - 0.5) * (0.028 + uCrisis * 0.03);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

/** A tile of random blood droplets, painted once, used as the lens-blood mask. */
export function makeSplat(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 512, 512);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 16; i++) {
    const x = rnd() * 512,
      y = rnd() * 512,
      r = 10 + rnd() * 38;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "#fff");
    g.addColorStop(0.7, "#ddd");
    g.addColorStop(1, "#000");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.8 + rnd() * 0.6), rnd() * 3, 0, Math.PI * 2);
    ctx.fill();
    // a drip running down from the larger drops
    if (r > 30) {
      const drip = ctx.createLinearGradient(x, y, x, y + r * 2.4);
      drip.addColorStop(0, "#ccc");
      drip.addColorStop(1, "#000");
      ctx.fillStyle = drip;
      ctx.fillRect(x - r * 0.18, y, r * 0.36, r * 2.4);
    }
  }
  return c;
}

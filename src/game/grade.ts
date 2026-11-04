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
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uCrisis, uAberration;
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

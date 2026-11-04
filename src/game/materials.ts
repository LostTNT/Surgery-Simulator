import * as THREE from "three";

/** Fine random micro-relief so the wet sheen sparkles instead of streaking like cling film. */
function wetNoise() {
  const size = 256,
    canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!,
    img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    img.data[i * 4] = 128 + (Math.random() - 0.5) * 70;
    img.data[i * 4 + 1] = 128 + (Math.random() - 0.5) * 70;
    img.data[i * 4 + 2] = 255;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 10);
  return tex;
}
// A small wrap-light term softens the waxy silhouette of opaque tissue without
// the extra scene render (and glass-like refraction) of a transmission material.
export function tissueMaterial(texture: THREE.Texture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const material = new THREE.MeshPhysicalMaterial({
    map: texture,
    bumpMap: texture,
    bumpScale: 0.032,
    color: 0xc99484,
    roughness: 0.46,
    clearcoat: 0.55,
    clearcoatRoughness: 0.08,
    clearcoatNormalMap: wetNoise(),
    clearcoatNormalScale: new THREE.Vector2(0.9, 0.9),
    sheen: 0.1,
    sheenColor: new THREE.Color(0xb85f54),
    sheenRoughness: 0.75,
    envMapIntensity: 0.62,
    side: THREE.DoubleSide,
  });
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <lights_fragment_end>",
      `#include <lights_fragment_end>
       float tissueWrap = pow(1.0 - max(dot(normal, geometryViewDir), 0.0), 2.0);
       reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(0.12, 0.025, 0.014) * tissueWrap;`,
    );
  };
  material.customProgramCacheKey = () => "suture-tissue-wrap-v2";
  return material;
}

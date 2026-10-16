import * as THREE from "three";

// A small wrap-light term softens the waxy silhouette of opaque tissue without
// the extra scene render (and glass-like refraction) of a transmission material.
export function tissueMaterial(texture: THREE.Texture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const material = new THREE.MeshPhysicalMaterial({
    map: texture,
    bumpMap: texture,
    bumpScale: 0.032,
    color: 0xe3c1b0,
    roughness: 0.48,
    clearcoat: 0.32,
    clearcoatRoughness: 0.23,
    sheen: 0.22,
    sheenColor: new THREE.Color(0xb85f54),
    sheenRoughness: 0.75,
    envMapIntensity: 0.48,
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
  material.customProgramCacheKey = () => "suture-tissue-wrap-v1";
  return material;
}

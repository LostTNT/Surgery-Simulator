import * as THREE from "three";
import type { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { WINDOW_RADIUS } from "./skull";

/** Head scan: Lee Perry-Smith / Infinite Realities, CC BY 3.0 (see public/ASSETS.md). */
export interface PatientHead {
  mesh: THREE.Group;
  skin: THREE.MeshPhysicalMaterial;
}
const HOLE = `
  varying vec3 vWorldPos;
`;
/** Remove the skin inside the incision, in both the colour and the shadow pass. */
function cutWindow(material: THREE.Material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("void main() {", `${HOLE}\nvoid main() {`)
      .replace(
        "#include <project_vertex>",
        "#include <project_vertex>\n  vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", `${HOLE}\nvoid main() {`)
      .replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>
  if (vWorldPos.x * vWorldPos.x + (vWorldPos.y / 0.84) * (vWorldPos.y / 0.84) < ${(WINDOW_RADIUS * WINDOW_RADIUS).toFixed(4)}) discard;`,
      );
  };
  material.customProgramCacheKey = () => "suture-skin-window-v1";
}
/** The pose of the head in field coordinates. The face points at the ceiling, the crown at the surgeon. */
export const HEAD_POSE = { x: -0.25, y: 3.0, z: -2.53, s: 1.5 };
export async function loadPatientHead(base: string, loader: GLTFLoader): Promise<PatientHead> {
  const tl = new THREE.TextureLoader();
  const [gltf, col, nor] = await Promise.all([
    loader.loadAsync(`${base}models/head.glb`),
    tl.loadAsync(`${base}textures/head-col.jpg`),
    tl.loadAsync(`${base}textures/head-normal.jpg`),
  ]);
  col.colorSpace = THREE.SRGBColorSpace;
  col.flipY = false;
  nor.flipY = false;
  col.anisotropy = nor.anisotropy = 8;
  const skin = new THREE.MeshPhysicalMaterial({
    map: col,
    normalMap: nor,
    normalScale: new THREE.Vector2(1, 1),
    // Prepped with antiseptic: warmer and glossier than bare skin.
    color: 0xf0b88a,
    roughness: 0.5,
    clearcoat: 0.25,
    clearcoatRoughness: 0.35,
    sheen: 0.4,
    sheenColor: new THREE.Color(0xffd0b0),
    sheenRoughness: 0.6,
  });
  cutWindow(skin);
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  cutWindow(depth);
  const group = new THREE.Group();
  gltf.scene.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.material = skin;
      o.customDepthMaterial = depth;
      o.castShadow = o.receiveShadow = true;
    }
  });
  group.add(gltf.scene);
  group.name = "patientHead";
  group.rotation.z = Math.PI; // crown toward the surgeon, face up
  placeHead(group);
  return { mesh: group, skin };
}
export function placeHead(group: THREE.Group) {
  group.position.set(HEAD_POSE.x, HEAD_POSE.y, HEAD_POSE.z);
  group.scale.setScalar(HEAD_POSE.s);
  group.updateMatrixWorld(true);
}

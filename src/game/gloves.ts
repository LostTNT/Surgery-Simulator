import * as THREE from "three";

const latex = new THREE.MeshPhysicalMaterial({
  color: 0xe0d0ae,
  roughness: 0.34,
  clearcoat: 0.45,
  clearcoatRoughness: 0.28,
  sheen: 0.5,
  sheenColor: new THREE.Color(0xf4fffb),
});
const knuckle = new THREE.MeshPhysicalMaterial({ color: 0xc2d2cd, roughness: 0.4, clearcoat: 0.3 });
const gown = new THREE.MeshStandardMaterial({ color: 0x1d3f5c, roughness: 0.92 });
const cuff = new THREE.MeshStandardMaterial({ color: 0xbfd0ca, roughness: 0.8 });

/** Local-space bounds of everything under `root`, measured in `root`'s own frame. */
function localBounds(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert(),
    box = new THREE.Box3();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.geometry.computeBoundingBox();
    box.union(
      o.geometry.boundingBox!.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)),
    );
  });
  return box;
}
/**
 * A surgeon's gloved hand gripping the instrument, with a gowned forearm running
 * off the edge of the screen, so the tool reads as held rather than floating.
 * The instrument tip is the local origin; its shaft runs along local x.
 */
export function addGlove(tool: THREE.Object3D, along = 0.78) {
  const box = localBounds(tool),
    size = box.getSize(new THREE.Vector3()),
    dir = Math.abs(box.max.x) >= Math.abs(box.min.x) ? 1 : -1,
    length = Math.max(size.x, 0.8),
    thick = Math.max(0.1, Math.min(size.y, size.z) * 0.5);
  void thick;
  const r = 0.3;
  const hand = new THREE.Group();
  hand.name = "glove";
  const capsule = (radius: number, len: number, mat: THREE.Material) => {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(radius, len, 8, 16), mat);
    m.rotation.z = Math.PI / 2;
    m.castShadow = true;
    return m;
  };
  const palm = capsule(r, r * 1.5, latex);
  palm.scale.set(1, 1, 0.9);
  hand.add(palm);
  // Fingers wrapped over the grip, thumb along the side.
  for (let i = 0; i < 4; i++) {
    const f = capsule(r * 0.34, r * 0.9, latex);
    f.rotation.x = 0;
    f.position.set(r * 0.5 - i * r * 0.04, r * 0.86, (i - 1.5) * r * 0.55);
    f.rotation.set(0, 0, Math.PI / 2 + 0.25);
    hand.add(f);
    const k = new THREE.Mesh(new THREE.SphereGeometry(r * 0.26, 12, 10), knuckle);
    k.position.set(-r * 0.28, r * 0.9, (i - 1.5) * r * 0.55);
    hand.add(k);
  }
  const thumb = capsule(r * 0.32, r * 1.1, latex);
  thumb.position.set(-r * 0.2, -r * 0.55, r * 0.95);
  thumb.rotation.set(0.5, 0.2, Math.PI / 2 - 0.2);
  hand.add(thumb);
  // Wrist cuff and gowned forearm to the edge of the frame.
  const wrist = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.95, r * 1.0, r * 0.7, 20), cuff);
  wrist.rotation.z = Math.PI / 2;
  wrist.position.x = dir * r * 1.9;
  hand.add(wrist);
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.0, r * 0.85, 12, 20), gown);
  sleeve.rotation.z = Math.PI / 2;
  sleeve.position.x = dir * (r * 2.25 + 6);
  sleeve.castShadow = true;
  hand.add(sleeve);
  hand.position.set(dir * length * along, 0, 0);
  hand.traverse((o) => {
    if (dir < 0) o.scale.x *= 1;
    if (o instanceof THREE.Mesh) o.receiveShadow = true;
  });
  tool.add(hand);
  // Blood on the working tip, shown once the instrument has been in blood.
  const blood = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.045, 0.34, 6, 12),
    new THREE.MeshPhysicalMaterial({ color: 0x3a0505, roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.92 }),
  );
  blood.name = "bloodTip";
  blood.rotation.z = Math.PI / 2;
  blood.position.x = dir * 0.2;
  blood.visible = false;
  tool.add(blood);
  // The shaft axis the first-person rig points toward the surgeon's hand.
  tool.userData.axis = new THREE.Vector3(dir, 0, 0);
  return hand;
}

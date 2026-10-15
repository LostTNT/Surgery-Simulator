import { Vector3, Quaternion, Box3, Line3, Ray, type Triangle } from "three";
import { ExtendedTriangle, type MeshBVH } from "three-mesh-bvh";
import type { Tool } from "./simulation";
import type { Vessel } from "./scene";
type Point = [number, number, number];
export interface Capsule {
  a: Vector3;
  b: Vector3;
  radius: number;
}
export function toolCapsules(tool: Tool): Capsule[] {
  const paths: Point[][] =
    tool === "bipolar"
      ? [-1, 1].map((side) => [
          [0, side * 0.025, 0],
          [0.2, side * 0.033, 0.012],
          [0.5, side * 0.065, 0.06],
          [1, side * 0.12, 0.14],
          [1.7, side * 0.13, 0.16],
          [2.3, side * 0.09, 0.16],
        ])
      : [
          [
            [0, 0, 0],
            [0.07, 0, 0.005],
            [0.16, 0, 0.02],
            [0.26, 0, 0.07],
            [0.36, 0, 0.13],
            [0.48, 0, 0.16],
            [2.3, 0, 0.16],
          ],
        ];
  return paths.flatMap((points) =>
    points
      .slice(0, -1)
      .map((a, i) => ({
        a: new Vector3(...a),
        b: new Vector3(...points[i + 1]),
        radius:
          tool === "bipolar"
            ? i < 2
              ? 0.014
              : i === 2
                ? 0.021
                : 0.035
            : tool === "irrigation"
              ? 0.022
              : 0.035,
      })),
  );
}
export function segmentDistanceSquared(
  a: Vector3,
  b: Vector3,
  c: Vector3,
  d: Vector3,
  targetA?: Vector3,
  targetB?: Vector3,
) {
  const u = b.clone().sub(a),
    v = d.clone().sub(c),
    w = a.clone().sub(c);
  const aa = u.dot(u),
    bb = u.dot(v),
    cc = v.dot(v),
    dd = u.dot(w),
    ee = v.dot(w),
    den = aa * cc - bb * bb;
  if (aa < 1e-12 && cc < 1e-12) return a.distanceToSquared(c);
  if (aa < 1e-12)
    return a.distanceToSquared(
      c.clone().addScaledVector(v, Math.max(0, Math.min(1, ee / cc))),
    );
  if (cc < 1e-12)
    return c.distanceToSquared(
      a.clone().addScaledVector(u, Math.max(0, Math.min(1, -dd / aa))),
    );
  let s = den > 1e-12 ? Math.max(0, Math.min(1, (bb * ee - cc * dd) / den)) : 0;
  let t = (bb * s + ee) / cc;
  if (t < 0) {
    t = 0;
    s = Math.max(0, Math.min(1, -dd / aa));
  } else if (t > 1) {
    t = 1;
    s = Math.max(0, Math.min(1, (bb - dd) / aa));
  }
  const pa = a.clone().addScaledVector(u, s),
    pb = c.clone().addScaledVector(v, t);
  targetA?.copy(pa);
  targetB?.copy(pb);
  return pa.distanceToSquared(pb);
}
function segmentTriangleDistance(
  triangle: ExtendedTriangle,
  line: Line3,
  onSegment?: Vector3,
  onTriangle?: Vector3,
) {
  const direction = line.end.clone().sub(line.start),
    length = direction.length();
  if (length > 1e-10) {
    const p = new Vector3();
    const hit = new Ray(
      line.start,
      direction.multiplyScalar(1 / length),
    ).intersectTriangle(triangle.a, triangle.b, triangle.c, false, p);
    if (hit && p.distanceTo(line.start) <= length + 1e-8) {
      onSegment?.copy(p);
      onTriangle?.copy(p);
      return 0;
    }
  }
  return triangle.closestPointToSegment(line, onTriangle, onSegment);
}
export function sweptSegmentDistance(
  a0: Vector3,
  b0: Vector3,
  a1: Vector3,
  b1: Vector3,
  c: Vector3,
  d: Vector3,
  contactPoint?: Vector3,
) {
  if (a0.distanceToSquared(a1) < 1e-12 && b0.distanceToSquared(b1) < 1e-12)
    return Math.sqrt(
      segmentDistanceSquared(a1, b1, c, d, undefined, contactPoint),
    );
  const line = new Line3(c, d),
    q1 = new ExtendedTriangle(a0, b0, a1),
    q2 = new ExtendedTriangle(b0, b1, a1);
  const p1 = new Vector3(),
    p2 = new Vector3(),
    d1 = segmentTriangleDistance(q1, line, p1),
    d2 = segmentTriangleDistance(q2, line, p2);
  contactPoint?.copy(d1 < d2 ? p1 : p2);
  return Math.min(d1, d2);
}
interface ContactTriangle extends ExtendedTriangle {
  distanceToTriangle(
    other: Triangle,
    target1?: Vector3,
    target2?: Vector3,
  ): number;
}
export function sweepTool(
  tool: Tool,
  previous: Vector3,
  next: Vector3,
  rotation: Quaternion,
  tree: MeshBVH,
  vessels: Vessel[],
  surface: (x: number, y: number) => number,
) {
  let tissue = false,
    vessel: string | null = null,
    hitPoint: Vector3 | null = null;
  for (const cap of toolCapsules(tool)) {
    const localA = cap.a.applyQuaternion(rotation),
      localB = cap.b.applyQuaternion(rotation);
    const a0 = localA.clone().add(previous),
      b0 = localB.clone().add(previous),
      a1 = localA.clone().add(next),
      b1 = localB.clone().add(next);
    const r = cap.radius - 0.002;
    const bounds = new Box3().setFromPoints([a0, b0, a1, b1]).expandByScalar(r);
    if (
      bounds.min.z > 0.24 ||
      bounds.max.x < -1.85 ||
      bounds.min.x > 1.85 ||
      bounds.max.y < -1.6 ||
      bounds.min.y > 1.6
    )
      continue;
    const moved = a0.distanceToSquared(a1) > 1e-12;
    const q1 = new ExtendedTriangle(a0, b0, a1),
      q2 = new ExtendedTriangle(b0, b1, a1),
      line = new Line3(a1, b1);
    if (!tissue)
      tree.shapecast({
        intersectsBounds: (box) => box.intersectsBox(bounds),
        intersectsTriangle: (tri) => {
          const point = new Vector3();
          let distance: number;
          if (moved) {
            const other = new Vector3(),
              d1 = (tri as ContactTriangle).distanceToTriangle(q1, point),
              d2 = (tri as ContactTriangle).distanceToTriangle(q2, other);
            distance = Math.min(d1, d2);
            if (d2 < d1) point.copy(other);
          } else
            distance = segmentTriangleDistance(tri, line, undefined, point);
          if (distance < r) {
            tissue = true;
            hitPoint = point;
            return true;
          }
          return false;
        },
      });
    if (!tissue)
      for (const p of [a1, b1, a1.clone().lerp(b1, 0.5)])
        if (
          (p.x * p.x) / 2.85 + (p.y * p.y) / 2.1 < 1 &&
          p.z + r < surface(p.x, p.y) - 0.01
        ) {
          tissue = true;
          hitPoint = new Vector3(p.x, p.y, surface(p.x, p.y));
        }
    if (!vessel)
      for (const v of vessels) {
        for (let i = 0; i < v.points.length - 1; i++) {
          const point = new Vector3();
          if (
            sweptSegmentDistance(
              a0,
              b0,
              a1,
              b1,
              v.points[i],
              v.points[i + 1],
              point,
            ) <
            r + v.radius
          ) {
            vessel = v.name;
            tissue = true;
            hitPoint = point;
            break;
          }
        }
        if (vessel) break;
      }
  }
  return { tissue, vessel, hitPoint };
}

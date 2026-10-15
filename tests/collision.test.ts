import test from "node:test";
import assert from "node:assert/strict";
import { Vector3, PlaneGeometry, Quaternion } from "three";
import { MeshBVH } from "three-mesh-bvh";
import {
  segmentDistanceSquared,
  sweptSegmentDistance,
  toolCapsules,
  sweepTool,
} from "../src/game/collision.ts";
const v = (x: number, y: number, z = 0) => new Vector3(x, y, z);
test("shaft contact returns the actual vessel point, away from the tip", () => {
  const tree = new MeshBVH(new PlaneGeometry(4, 4));
  const hit = sweepTool("suction", v(0, 0), v(0, 0), new Quaternion(), tree,
    [{ name: "test vessel", points: [v(1, -.1, .16), v(1, .1, .16)], radius: .02 }], () => 0);
  assert.equal(hit.vessel, "test vessel");
  assert.ok(hit.hitPoint && Math.abs(hit.hitPoint.x - 1) < 1e-8);
  assert.ok(hit.hitPoint!.distanceTo(v(0, 0)) > .9);
});
test("segments detect perpendicular crossing and parallel separation", () => {
  assert.ok(
    segmentDistanceSquared(v(-1, 0), v(1, 0), v(0, -1), v(0, 1)) < 1e-10,
  );
  assert.ok(
    Math.abs(segmentDistanceSquared(v(-1, 0), v(1, 0), v(-1, 2), v(1, 2)) - 4) <
      1e-10,
  );
});
test("swept shaft detects a narrow vessel between start and end positions", () => {
  const distance = sweptSegmentDistance(
    v(-1, -1),
    v(1, -1),
    v(-1, 1),
    v(1, 1),
    v(0, 0, -0.5),
    v(0, 0, 0.5),
  );
  assert.ok(distance < 1e-8);
});
test("stationary shaft has finite accurate contact distance", () => {
  const d = sweptSegmentDistance(
    v(-1, 0),
    v(1, 0),
    v(-1, 0),
    v(1, 0),
    v(0, -1, 0.1),
    v(0, 1, 0.1),
  );
  assert.ok(Math.abs(d - 0.1) < 1e-8);
});
test("bipolar collision volumes preserve the gap between tine tips", () => {
  const caps = toolCapsules("bipolar");
  assert.equal(caps.length, 10);
  assert.ok(caps.every((c) => Math.abs(c.a.y) >= 0.025));
  const origin = v(0, 0);
  assert.ok(
    caps.every(
      (c) =>
        segmentDistanceSquared(c.a, c.b, origin, origin) > c.radius * c.radius,
    ),
  );
});

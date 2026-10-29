import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export type CourseTheme = "daily" | "love" | "money";
export const THEMES = {
  daily: {
    sky: 0xcceee9,
    top: "#8bddea",
    bottom: "#dff3df",
    water: 0x79cfd9,
    island: 0xf5e4bc,
    grass: 0xa8cf90,
    leaf: 0x80b981,
    accent: 0xffa17f,
    roof: 0xe9ba75,
    hill: 0xa6d7c3,
  },
  love: {
    sky: 0xf6dfdc,
    top: "#c4dce9",
    bottom: "#ffe7d7",
    water: 0xb4d9dd,
    island: 0xf4ddcf,
    grass: 0xc6dcb0,
    leaf: 0xf3b1c1,
    accent: 0xea9da9,
    roof: 0xe7acb4,
    hill: 0xd6c8d6,
  },
  money: {
    sky: 0xe0efdd,
    top: "#a8e0df",
    bottom: "#f8efc9",
    water: 0x97d4c6,
    island: 0xe9d6a8,
    grass: 0xb4d09b,
    leaf: 0x80b590,
    accent: 0xe7b94f,
    roof: 0xe8bc59,
    hill: 0xb2cfad,
  },
} as const;
type Shape = "box" | "ball" | "cylinder" | "cone" | "arch" | "heart";
type Piece = {
  shape: Shape;
  slot: number;
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  rx: number;
  ry: number;
  rz: number;
  color: number;
  float?: number;
};
/** A toy promenade assembled into six shared draw calls, regardless of category. */
export function createScenery(scene: THREE.Scene, theme: CourseTheme) {
  const palette = THEMES[theme];
  const pieces: Piece[] = [];
  const groups = new Map<
    Shape,
    { mesh: THREE.InstancedMesh; pieces: Piece[] }
  >();
  const geometry = new Map<Shape, THREE.BufferGeometry>();
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.8,
  });
  const scratch = new THREE.Object3D();
  const color = new THREE.Color();
  const slots = 12,
    spacing = 13,
    depth = slots * spacing;
  function add(
    shape: Shape,
    slot: number,
    color: number,
    x: number,
    y: number,
    z: number,
    sx = 1,
    sy = sx,
    sz = sx,
    rx = 0,
    ry = 0,
    rz = 0,
    float = 0,
  ) {
    pieces.push({ shape, slot, color, x, y, z, sx, sy, sz, rx, ry, rz, float });
  }
  const b = (
    slot: number,
    c: number,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    ry = 0,
    rz = 0,
  ) => add("box", slot, c, x, y, z, sx, sy, sz, 0, ry, rz);
  const ball = (
    slot: number,
    c: number,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy = sx,
    sz = sx,
    float = 0,
  ) => add("ball", slot, c, x, y, z, sx, sy, sz, 0, 0, 0, float);
  function tree(slot: number, x: number, z: number, size: number) {
    add(
      "cylinder",
      slot,
      0xb38b66,
      x,
      0.85 * size,
      z,
      0.14 * size,
      1.7 * size,
      0.14 * size,
    );
    ball(
      slot,
      palette.leaf,
      x,
      2.25 * size,
      z,
      0.9 * size,
      1.05 * size,
      0.83 * size,
    );
    ball(
      slot,
      theme === "love" ? 0xf8c8d0 : 0xa0ca8d,
      x + 0.58 * size,
      2.08 * size,
      z + 0.2,
      0.63 * size,
      0.7 * size,
      0.68 * size,
    );
    if (theme === "love")
      for (let i = 0; i < 3; i++)
        ball(
          slot,
          0xffebdb,
          x + (i - 1) * 0.35,
          2.6 * size + (i % 2) * 0.1,
          z + 0.66,
          0.1,
        );
  }
  function flowers(slot: number, x: number, z: number) {
    for (let i = 0; i < 3; i++) {
      const px = x + (i - 1) * 0.37,
        pz = z + (i % 2) * 0.22;
      add("cylinder", slot, 0x679771, px, 0.2, pz, 0.025, 0.38, 0.025);
      ball(
        slot,
        [0xffbb89, 0xf4d76c, 0xf5becb][i],
        px,
        0.43,
        pz,
        0.15,
        0.095,
        0.15,
      );
      ball(slot, 0xfff0c8, px, 0.48, pz, 0.055);
    }
  }
  function bench(slot: number, x: number, z: number) {
    b(slot, 0xc38b60, x, 0.58, z, 1.85, 0.12, 0.55);
    b(slot, 0xdca777, x, 1.04, z - 0.25, 1.85, 0.65, 0.1);
    for (const side of [-1, 1])
      b(slot, 0x6b8e79, x + side * 0.67, 0.27, z, 0.12, 0.55, 0.45);
  }
  function balloon(slot: number, x: number, z: number) {
    add("cylinder", slot, 0xd7c8a0, x, 1.1, z, 0.017, 2.15, 0.017);
    if (theme === "love")
      add(
        "heart",
        slot,
        0xec99ae,
        x,
        2.5,
        z,
        0.64,
        0.64,
        0.5,
        0,
        0,
        -0.09,
        slot * 0.7,
      );
    else
      ball(
        slot,
        [palette.accent, 0x9bc9bc, 0xf2d47b][slot % 3],
        x,
        2.55,
        z,
        0.48,
        0.62,
        0.48,
        slot * 0.7,
      );
  }
  function sailboat(slot: number, x: number, z: number) {
    b(slot, 0xf3d6aa, x, -1.19, z, 2.4, 0.35, 1.1, 0.2);
    b(slot, 0xffffec, x, -0.3, z, 0.065, 1.8, 0.065);
    add(
      "cone",
      slot,
      slot % 2 ? palette.accent : 0xffefc9,
      x + 0.42,
      -0.23,
      z,
      0.84,
      1.75,
      0.08,
      0,
      0,
      -0.06,
    );
  }
  function stand(slot: number, x: number, z: number) {
    b(slot, 0xf5e8ca, x, 0.66, z, 2.45, 1.28, 1.32);
    b(slot, 0x975f45, x, 1.27, z + 0.15, 2.7, 0.13, 1.6);
    for (const side of [-1, 1])
      b(slot, 0xf5dcaa, x + side * 1.13, 1.92, z - 0.45, 0.12, 1.7, 0.12);
    for (let i = 0; i < 4; i++)
      b(
        slot,
        i % 2 ? 0xfff1d6 : palette.accent,
        x + (i - 1.5) * 0.77,
        2.72,
        z,
        0.76,
        0.25,
        2.1,
      );
    for (let i = 0; i < 4; i++)
      b(
        slot,
        i % 2 ? 0xfff3d9 : palette.accent,
        x + (i - 1.5) * 0.67,
        2.43,
        z + 0.93,
        0.64,
        0.55,
        0.12,
      );
    for (let i = 0; i < 3; i++)
      ball(
        slot,
        [0xf0c354, 0xe89d77, 0x9ac78b][i],
        x + (i - 1) * 0.63,
        1.53,
        z + 0.18,
        0.23,
        0.22,
        0.23,
      );
  }
  function parasol(slot: number, x: number, z: number) {
    add("cylinder", slot, 0xb89567, x, 1.2, z, 0.055, 2.4, 0.055);
    add("cone", slot, palette.accent, x, 2.55, z, 1.25, 0.6, 1.25);
    b(slot, 0xf5e5c2, x, 0.82, z, 1.5, 0.12, 1.25);
  }
  for (let slot = 0; slot < slots; slot++) {
    const side = slot % 2 ? -1 : 1;
    const x = side * (6.15 + (slot % 3) * 0.4);
    b(slot, palette.island, x, -0.3, 0, 4.25, 0.48, 11.3);
    b(slot, palette.grass, x, 0, 0, 4.15, 0.1, 11.15);
    // Leave an open waterfront now and then instead of repeating identical tree islands.
    const variant = Math.floor(slot / 2) % 4;
    if (variant === 0 && theme === "money") {
      stand(slot, x, 0);
      flowers(slot, x - side * 1.6, 3);
      balloon(slot, x + side * 1.4, -2.8);
    }
    if (variant === 0 && theme !== "money") {
      tree(slot, x + side * 0.9, -2.4, 1.05);
      bench(slot, x - side * 0.25, 1.7);
      flowers(slot, x - side * 0.8, -0.2);
      balloon(slot, x + side * 1.7, 2.2);
    }
    if (variant === 1) {
      if (theme === "money") stand(slot, x, 0);
      else {
        tree(slot, x - side * 0.9, -2.5, 0.8);
        parasol(slot, x + 0.35, 1);
        flowers(slot, x - side * 1.5, 2.8);
      }
      sailboat(slot, side * 9.8, 3.2);
    }
    if (variant === 2) {
      if (theme === "money") {
        stand(slot, x - side * 0.1, 0);
        balloon(slot, x + side * 1.5, 2.8);
        b(slot, 0xf3dfae, x - side * 1.25, 0.4, 3.3, 1.2, 0.8, 1.2);
        flowers(slot, x - side * 1.2, 3.3);
      } else if (theme === "love") {
        tree(slot, x + side * 0.7, -2.9, 1.0);
        bench(slot, x, 2.5);
        add(
          "cylinder",
          slot,
          0xd4af9d,
          x - side * 0.8,
          0.7,
          -0.2,
          0.12,
          1.4,
          0.12,
        );
        add(
          "heart",
          slot,
          0xe993a8,
          x - side * 0.8,
          2.0,
          -0.2,
          1.85,
          1.85,
          0.7,
          0,
          0,
          -0.03,
        );
        add(
          "heart",
          slot,
          0xffddca,
          x + side * 0.8,
          2.65,
          0.4,
          0.72,
          0.72,
          0.35,
          0,
          0,
          0.1,
        );
        flowers(slot, x - side * 1.4, 1.8);
      } else {
        tree(slot, x + side * 0.8, -2.9, 1);
        bench(slot, x, 2.8);
        add(
          "cylinder",
          slot,
          0xc79d72,
          x - side * 0.9,
          1.45,
          -0.3,
          0.065,
          2.9,
          0.065,
        );
        for (let i = 0; i < 4; i++)
          b(
            slot,
            [0xf5be73, 0x8dcbb6, 0xf3a48f, 0xf6db94][i],
            x - side * 0.9 + (i % 2 ? -0.37 : 0.37),
            2.68 + (i < 2 ? -0.37 : 0.37),
            -0.2,
            0.72,
            0.72,
            0.13,
            0,
            Math.PI / 4,
          );
        ball(slot, 0xfff2d5, x - side * 0.9, 2.68, -0.06, 0.16, 0.16, 0.08);
        sailboat(slot, side * 9.6, 3.2);
        flowers(slot, x - side * 1.3, 1.8);
      }
    }
    if (variant === 3) {
      if (theme === "money") stand(slot, x, 0);
      else {
        tree(slot, x + side * 0.9, -2.3, 1.15);
        bench(slot, x - side * 0.35, 1.4);
      }
      balloon(slot, x - side * 1.65, 2.8);
      flowers(slot, x + side * 0.8, 3.3);
    }
    // Low promenade rail and three tiny pennants add a readable sense of passing places.
    for (const dir of [-1, 1]) {
      b(slot, 0xf4e9cd, x + dir * 2.2, 0.44, -3.5, 0.1, 0.9, 0.12);
      b(slot, 0xf4e9cd, x + dir * 2.2, 0.44, 3.5, 0.1, 0.9, 0.12);
    }
    b(slot, 0xf6edd5, x, 0.78, -3.5, 4.5, 0.07, 0.08);
    for (let i = 0; i < 3; i++)
      add(
        "cone",
        slot,
        [palette.accent, 0xeed47d, 0x91c7b2][i],
        x + (i - 1) * 0.9,
        0.55,
        -3.5,
        0.19,
        0.48,
        0.04,
        0,
        0,
        Math.PI,
      );
  }
  for (let slot = 0; slot < slots; slot++) {
    const side = slot % 2 ? -1 : 1;
    flowers(slot, side * 4.45, 4.8);
    b(
      slot,
      theme === "love" ? 0xf3bdc4 : theme === "money" ? 0xe9cc79 : 0x9bc995,
      side * 4.65,
      0.075,
      3.9,
      0.18,
      0.15,
      2.8,
    );
  }
  // A few quiet silhouettes join the horizon to the same colour family as the water.
  for (let i = 0; i < 6; i++)
    ball(
      -1,
      palette.hill,
      (i % 2 ? -1 : 1) * (34 + (i % 3) * 12),
      -4,
      -90 - i * 12,
      22,
      10 + (i % 3) * 3,
      18,
    );
  // Floating navigation buoys sit beyond the rails, never in the choice lanes.
  for (let i = 0; i < 8; i++) {
    const slot = i % slots,
      side = i % 2 ? -1 : 1;
    ball(slot, 0xfff1c7, side * 12, -1.33, -4, 0.26, 0.15, 0.26);
    add("cone", slot, palette.accent, side * 12, -1.04, -4, 0.17, 0.48, 0.17);
  }
  const heartShape = new THREE.Shape();
  heartShape.moveTo(0, -0.55);
  heartShape.bezierCurveTo(-0.65, -0.1, -0.75, 0.37, -0.33, 0.5);
  heartShape.bezierCurveTo(-0.12, 0.58, 0, 0.4, 0, 0.3);
  heartShape.bezierCurveTo(0, 0.4, 0.12, 0.58, 0.33, 0.5);
  heartShape.bezierCurveTo(0.75, 0.37, 0.65, -0.1, 0, -0.55);
  geometry.set("box", new RoundedBoxGeometry(1, 1, 1, 1, 0.065));
  geometry.set("ball", new THREE.SphereGeometry(1, 10, 8));
  geometry.set("cylinder", new THREE.CylinderGeometry(1, 1, 1, 8));
  geometry.set("cone", new THREE.ConeGeometry(1, 1, 10));
  geometry.set("arch", new THREE.TorusGeometry(1, 0.09, 6, 18, Math.PI));
  geometry.set(
    "heart",
    new THREE.ExtrudeGeometry(heartShape, {
      depth: 0.18,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.04,
      bevelSegments: 1,
      steps: 1,
      curveSegments: 5,
    }),
  );
  for (const shape of [
    "box",
    "ball",
    "cylinder",
    "cone",
    "arch",
    "heart",
  ] as Shape[]) {
    const records = pieces.filter((p) => p.shape === shape);
    if (!records.length) continue;
    const mesh = new THREE.InstancedMesh(
      geometry.get(shape)!,
      material,
      records.length,
    );
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    records.forEach((p, i) => mesh.setColorAt(i, color.setHex(p.color)));
    scene.add(mesh);
    groups.set(shape, { mesh, pieces: records });
  }
  function update(shift: number, time: number, reduced: boolean) {
    groups.forEach(({ mesh, pieces }) => {
      pieces.forEach((p, i) => {
        const anchor =
          p.slot < 0
            ? 0
            : 15 - ((p.slot * spacing + depth - (shift % depth)) % depth);
        scratch.position.set(
          p.x,
          p.y +
            (p.float && !reduced ? Math.sin(time * 1.25 + p.float) * 0.08 : 0),
          p.z + anchor,
        );
        scratch.rotation.set(
          p.rx,
          p.ry,
          p.rz + (p.float && !reduced ? Math.sin(time + p.float) * 0.035 : 0),
        );
        scratch.scale.set(p.sx, p.sy, p.sz);
        scratch.updateMatrix();
        mesh.setMatrixAt(i, scratch.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    });
  }
  update(0, 0, true);
  return {
    update,
    dispose() {
      groups.forEach(({ mesh }) => {
        scene.remove(mesh);
        mesh.dispose();
      });
      geometry.forEach((g) => g.dispose());
      material.dispose();
    },
  };
}

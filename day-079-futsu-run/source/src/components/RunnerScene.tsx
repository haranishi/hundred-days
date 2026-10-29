"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RUN_STEPS_PER_SECOND } from "@/lib/audio/score";
import { createScenery, THEMES, type CourseTheme } from "./runner/Scenery";

export type RunnerPhase =
  | "idle"
  | "running"
  | "choosing"
  | "reveal"
  | "fall"
  | "finish";
export interface RunnerSceneProps {
  lane: -1 | 0 | 1;
  phase: RunnerPhase;
  /** Gate distance: 0 = far away, 1 = crossing, >1 = cleared. */
  progress: number;
  accent?: string;
  onReady?: () => void;
  split?: [number, number] | null;
  questionKey?: string | number;
  paused?: boolean;
  category?: CourseTheme;
  gateLabels?: [string, string];
  gateBadges?: [string, string];
  holding?: boolean;
  onFootstep?: (side: "left" | "right") => void;
}

const C = {
  sky: 0xc9eeea,
  ivory: 0xfffdf3,
  green: 0x42ce90,
  greenDark: 0x136c4e,
  mint: 0xe4f2dc,
  coral: 0xff8d75,
  peach: 0xf9e8df,
  yellow: 0xffd670,
  ink: 0x22483c,
  navy: 0x384f61,
  hair: 0x493a31,
};

/** Original procedural art. The React game, never this scene, decides an answer. */
export default function RunnerScene(props: RunnerSceneProps) {
  const host = useRef<HTMLDivElement>(null);
  const current = useRef(props);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    current.current = props;
  }, [props]);

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "low-power",
      });
    } catch {
      queueMicrotask(() => setUnavailable(true));
      current.current.onReady?.();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.13;
    // Software WebGL keeps the same art with soft contact shadows, avoiding a costly depth pass.
    const gl = renderer.getContext();
    const debugRenderer = gl.getExtension("WEBGL_debug_renderer_info");
    const rendererName = debugRenderer
      ? String(gl.getParameter(debugRenderer.UNMASKED_RENDERER_WEBGL))
      : "";
    const softwareRenderer = /SwiftShader|llvmpipe|Software Rasterizer/i.test(
      rendererName,
    );
    renderer.shadowMap.enabled = !softwareRenderer;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.style.cssText = "display:block;width:100%;height:100%;";
    renderer.domElement.setAttribute("aria-hidden", "true");
    container.appendChild(renderer.domElement);

    const category = current.current.category ?? "daily";
    const theme = THEMES[category];
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(theme.sky, 36, 110);
    const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 180);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    const geometryCache = new Map<string, THREE.BufferGeometry>();
    const materialCache = new Map<string, THREE.MeshStandardMaterial>();
    const colorScratch = new THREE.Color();
    const matrixScratch = new THREE.Object3D();
    function material(color: number, roughness = 0.7) {
      const key = `${color}:${roughness}`;
      let mat = materialCache.get(key);
      if (!mat) {
        mat = new THREE.MeshStandardMaterial({
          color,
          roughness,
          metalness: 0,
        });
        materialCache.set(key, mat);
        materials.add(mat);
      }
      return mat;
    }
    function geometry(key: string, factory: () => THREE.BufferGeometry) {
      let g = geometryCache.get(key);
      if (!g) {
        g = factory();
        geometryCache.set(key, g);
        geometries.add(g);
      }
      return g;
    }
    const rounded = (w: number, h: number, d: number, r: number) =>
      geometry(
        `b${w},${h},${d},${r}`,
        () => new RoundedBoxGeometry(w, h, d, 3, r),
      );
    const ball = (r: number, low = false) =>
      geometry(
        `s${r},${low}`,
        () => new THREE.SphereGeometry(r, low ? 10 : 20, low ? 8 : 14),
      );
    const capsule = (r: number, length: number) =>
      geometry(
        `c${r},${length}`,
        () => new THREE.CapsuleGeometry(r, length, 4, 12),
      );
    function mesh(
      g: THREE.BufferGeometry,
      color: number,
      parent: THREE.Object3D = scene,
      shadow = false,
    ) {
      const m = new THREE.Mesh(g, material(color));
      m.castShadow = shadow;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    }
    const box = (
      w: number,
      h: number,
      d: number,
      r: number,
      color: number,
      parent?: THREE.Object3D,
      shadow = false,
    ) => mesh(rounded(w, h, d, r), color, parent, shadow);
    function instances(
      g: THREE.BufferGeometry,
      count: number,
      mat: THREE.Material = material(C.ivory),
    ) {
      const m = new THREE.InstancedMesh(g, mat, count);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.receiveShadow = true;
      m.frustumCulled = false;
      scene.add(m);
      return m;
    }
    function instanceAt(
      m: THREE.InstancedMesh,
      i: number,
      x: number,
      y: number,
      z: number,
      sx = 1,
      sy = 1,
      sz = 1,
      ry = 0,
    ) {
      matrixScratch.position.set(x, y, z);
      matrixScratch.scale.set(sx, sy, sz);
      matrixScratch.rotation.set(0, ry, 0);
      matrixScratch.updateMatrix();
      m.setMatrixAt(i, matrixScratch.matrix);
    }

    // The atmosphere, horizon and fog share one quiet, warm daylight palette.
    const skyCanvas = document.createElement("canvas");
    skyCanvas.width = 2;
    skyCanvas.height = 256;
    const skyContext = skyCanvas.getContext("2d");
    if (skyContext) {
      const gradient = skyContext.createLinearGradient(0, 0, 0, 256);
      gradient.addColorStop(0, theme.top);
      gradient.addColorStop(
        0.55,
        `#${theme.sky.toString(16).padStart(6, "0")}`,
      );
      gradient.addColorStop(1, theme.bottom);
      skyContext.fillStyle = gradient;
      skyContext.fillRect(0, 0, 2, 256);
      const sky = new THREE.CanvasTexture(skyCanvas);
      sky.colorSpace = THREE.SRGBColorSpace;
      textures.add(sky);
      scene.background = sky;
    } else scene.background = new THREE.Color(theme.sky);
    scene.add(new THREE.HemisphereLight(0xfff9e9, 0x7ba894, 1.75));
    const sun = new THREE.DirectionalLight(0xfff0d4, 2.5);
    sun.position.set(-7, 13, 8);
    sun.target.position.set(0, 0, -5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.radius = 3;
    sun.shadow.camera.left = -9;
    sun.shadow.camera.right = 9;
    sun.shadow.camera.top = 12;
    sun.shadow.camera.bottom = -11;
    sun.shadow.camera.far = 42;
    sun.shadow.normalBias = 0.035;
    sun.shadow.bias = -0.00016;
    scene.add(sun, sun.target);
    const rim = new THREE.DirectionalLight(0xd9efff, 0.95);
    rim.position.set(7, 6, -10);
    scene.add(rim);

    const road = box(10.6, 0.65, 145, 0.25, C.ivory);
    road.position.set(0, -0.36, -52);
    const foundation = box(10.68, 0.18, 145, 0.08, 0xc2d9bd);
    foundation.position.set(0, -0.76, -52);
    const leftRoad = box(5.1, 0.018, 140, 0.008, 0xe0edcf);
    leftRoad.position.set(-2.6, -0.022, -52);
    const rightRoad = box(5.1, 0.018, 140, 0.008, 0xffe4d4);
    rightRoad.position.set(2.6, -0.022, -52);
    for (const side of [-1, 1]) {
      const rail = box(0.13, 0.14, 145, 0.06, side < 0 ? 0x95ceaa : 0xf1bba5);
      rail.position.set(side * 5.26, 0.09, -52);
    }
    const centerDashes = instances(
      rounded(0.075, 0.018, 1.15, 0.007),
      26,
      material(0xccd8c5),
    );
    const paving = instances(rounded(4.94, 0.008, 2.8, 0.003), 34);
    for (let i = 0; i < 34; i++)
      paving.setColorAt(i, colorScratch.setHex(i % 2 ? 0xffeddf : 0xe9f1d7));
    const edgeLights = instances(rounded(0.23, 0.08, 0.72, 0.035), 44);
    for (let i = 0; i < 44; i++)
      edgeLights.setColorAt(i, colorScratch.setHex(i % 2 ? C.coral : C.green));
    const arrowGeo = geometry("road-arrow", () => {
      const shape = new THREE.Shape();
      shape.moveTo(-0.24, 0);
      shape.lineTo(0, -0.28);
      shape.lineTo(0.24, 0);
      shape.lineTo(0.15, 0.09);
      shape.lineTo(0, -0.07);
      shape.lineTo(-0.15, 0.09);
      shape.closePath();
      return new THREE.ShapeGeometry(shape);
    });
    const roadArrows = instances(arrowGeo, 14, material(0xb3cfb6));
    for (let i = 0; i < 14; i++)
      roadArrows.setColorAt(
        i,
        colorScratch.setHex(i % 2 ? 0xe6b7a4 : 0x9ec7a8),
      );
    const water = new THREE.Mesh(
      geometry("water", () => new THREE.PlaneGeometry(600, 600)),
      material(theme.water, 0.4),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, -2.2, -50);
    scene.add(water);

    const scenery = createScenery(scene, category);
    const clouds = instances(ball(1), 21, material(0xf9f8e9));
    for (let i = 0; i < 7; i++) {
      const x = (i % 2 ? -1 : 1) * (9 + (i % 3) * 3);
      const y = 5 + (i % 3) * 1.1;
      const z = -20 - i * 13;
      for (let j = 0; j < 3; j++)
        instanceAt(
          clouds,
          i * 3 + j,
          x + (j - 1) * 1.35,
          y + (j % 2) * 0.25,
          z,
          1.3 + j * 0.1,
          0.5 + (j % 2) * 0.3,
          0.65,
        );
    }
    clouds.instanceMatrix.needsUpdate = true;

    const gatePair = new THREE.Group();
    scene.add(gatePair);
    for (const side of [-1, 1]) {
      const x = side * 2.63;
      const color = side < 0 ? C.green : C.coral;
      for (const edge of [-1, 1]) {
        const post = box(0.39, 4.25, 0.65, 0.18, color, gatePair);
        post.position.set(x + edge * 2.43, 2.1, 0);
        const foot = box(
          0.72,
          0.22,
          1.0,
          0.1,
          side < 0 ? 0x1e9367 : 0xd67960,
          gatePair,
        );
        foot.position.set(x + edge * 2.43, 0.1, 0);
        const glint = box(
          0.07,
          3.1,
          0.035,
          0.016,
          side < 0 ? 0xb2f5cb : 0xffd4bf,
          gatePair,
        );
        glint.position.set(x + edge * 2.43 - 0.08, 2.2, 0.35);
      }
      const top = box(5.22, 1.08, 0.67, 0.22, color, gatePair);
      top.position.set(x, 4.25, 0);
      const threshold = box(4.7, 0.04, 0.38, 0.018, color, gatePair);
      threshold.position.set(x, 0.04, 0.5);
      const light = box(4.3, 0.012, 0.13, 0.005, C.ivory, gatePair);
      light.position.set(x, 0.066, 0.56);
    }

    const gateMaterials = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const child of [...gatePair.children]) {
      if (!(child instanceof THREE.Mesh)) continue;
      child.updateMatrix();
      let copy = child.geometry.clone().applyMatrix4(child.matrix);
      if (copy.index) {
        const indexed = copy;
        copy = indexed.toNonIndexed();
        indexed.dispose();
      }
      const mat = child.material as THREE.Material;
      const group = gateMaterials.get(mat) ?? [];
      group.push(copy);
      gateMaterials.set(mat, group);
      gatePair.remove(child);
    }
    gateMaterials.forEach((parts, mat) => {
      const merged = mergeGeometries(parts, false);
      parts.forEach((g) => g.dispose());
      if (!merged) return;
      geometries.add(merged);
      const gateMesh = new THREE.Mesh(merged, mat);
      gateMesh.receiveShadow = true;
      gatePair.add(gateMesh);
    });

    const gateSigns = [-1, 1].map((side) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1024;
      canvas.height = 360;
      const context = canvas.getContext("2d");
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      textures.add(texture);
      const signMaterial = new THREE.MeshBasicMaterial({ map: texture });
      materials.add(signMaterial);
      const sign = new THREE.Mesh(
        geometry("gate-label-plane", () => new THREE.PlaneGeometry(4.5, 1.58)),
        signMaterial,
      );
      sign.position.set(side * 2.63, 2.0, 0.43);
      gatePair.add(sign);
      const backing = box(4.65, 1.72, 0.16, 0.15, C.ivory, gatePair);
      backing.position.set(side * 2.63, 2.0, 0.3);
      return { canvas, context, texture, side };
    });
    let lastSignContent = "";
    function updateGateSigns() {
      const labels = current.current.gateLabels ?? [
        "自分の道",
        "もうひとつの道",
      ];
      const badges = current.current.gateBadges ?? ["A", "B"];
      const signature = JSON.stringify([labels, badges]);
      if (signature === lastSignContent) return;
      lastSignContent = signature;
      gateSigns.forEach(({ canvas, context: ctx, texture, side }, i) => {
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#fffdf3";
        ctx.fillRect(0, 0, 1024, 360);
        const ink = side < 0 ? "#216347" : "#a65e48";
        ctx.fillStyle = side < 0 ? "#e0f1ca" : "#ffe0cf";
        ctx.beginPath();
        ctx.roundRect(20, 108, 138, 144, 36);
        ctx.fill();
        ctx.fillStyle = ink;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `800 ${badges[i].length > 2 ? 34 : 54}px Arial, 'Hiragino Kaku Gothic ProN', sans-serif`;
        ctx.fillText(badges[i], 89, 181);
        const text = labels[i];
        const lines =
          text.length > 6
            ? [
                text.slice(0, Math.ceil(text.length / 2)),
                text.slice(Math.ceil(text.length / 2)),
              ]
            : [text];
        let size = lines.length === 1 ? 174 : 132;
        ctx.font = `800 ${size}px 'Hiragino Kaku Gothic ProN', 'Yu Gothic', sans-serif`;
        while (
          Math.max(...lines.map((line) => ctx.measureText(line).width)) > 790 &&
          size > 74
        ) {
          size -= 2;
          ctx.font = `800 ${size}px 'Hiragino Kaku Gothic ProN', 'Yu Gothic', sans-serif`;
        }
        lines.forEach((line, index) =>
          ctx.fillText(
            line,
            594,
            lines.length === 1 ? 182 : index === 0 ? 98 : 246,
          ),
        );
        texture.needsUpdate = true;
      });
    }
    updateGateSigns();

    // NPC body parts are instanced, while their lightweight node rigs keep real articulation.
    type InstanceRecord = { node: THREE.Object3D; color: number };
    const npcPools = new Map<THREE.BufferGeometry, InstanceRecord[]>();
    function part(
      g: THREE.BufferGeometry,
      color: number,
      parent: THREE.Object3D,
      main: boolean,
    ): THREE.Object3D {
      if (main) return mesh(g, color, parent, true);
      const node = new THREE.Object3D();
      parent.add(node);
      const records = npcPools.get(g) ?? [];
      records.push({ node, color });
      npcPools.set(g, records);
      return node;
    }
    type Figure = {
      group: THREE.Group;
      body: THREE.Object3D;
      hips: THREE.Group[];
      knees: THREE.Group[];
      shoulders: THREE.Group[];
      elbows: THREE.Group[];
      head: THREE.Group;
      baseX: number;
      baseZ: number;
      offset: number;
      shirt: number;
      bodyRecord?: InstanceRecord;
    };
    const outfit = [0xa3c3ce, 0xe2b37f, 0xbbafd7, 0x99bea3, 0xdca39a, 0x84b0bd];
    const skins = [0xf8d8ad, 0xe5b58b, 0xc48f65, 0xf5d7bd];
    function figure(
      main: boolean,
      x: number,
      z: number,
      offset: number,
    ): Figure {
      const group = new THREE.Group();
      scene.add(group);
      group.position.set(x, 0.03, z);
      const size = main ? 1 : 0.69 + (offset % 3) * 0.035;
      group.scale.setScalar(size);
      const shirt = main ? 0xf5e6bb : outfit[offset % outfit.length];
      const trousers = main
        ? 0x245f4c
        : [0x526578, 0x6b655f, 0x5e7060][offset % 3];
      const skin = main ? 0xf5d0a3 : skins[offset % skins.length];
      const body = part(rounded(0.7, 0.78, 0.47, 0.18), shirt, group, main);
      body.position.y = 1.4;
      const bodyRecord = main
        ? undefined
        : npcPools.get(rounded(0.7, 0.78, 0.47, 0.18))!.at(-1);
      const neck = part(capsule(0.12, 0.06), skin, group, main);
      neck.position.y = 1.88;
      const head = new THREE.Group();
      head.position.y = 2.2;
      group.add(head);
      const face = part(ball(0.37), skin, head, main);
      face.scale.set(0.95, 1.04, 0.96);
      for (const side of [-1, 1]) {
        const ear = part(ball(0.078), skin, head, main);
        ear.position.set(side * 0.35, -0.015, 0);
      }
      if (main) {
        const hair = part(ball(0.37), C.hair, head, true);
        hair.position.set(0, 0.07, 0.04);
        hair.scale.set(1.03, 0.8, 0.99);
        const cap = part(ball(0.39), 0x207c50, head, true);
        cap.position.set(0, 0.22, 0.015);
        cap.scale.set(1.03, 0.62, 1.05);
        const brim = part(
          rounded(0.57, 0.075, 0.39, 0.035),
          0x176343,
          head,
          true,
        );
        brim.position.set(0, 0.18, -0.33);
        const capButton = part(ball(0.055), 0xf1d57b, head, true);
        capButton.position.set(0, 0.47, 0.02);
        const capPanel = part(
          rounded(0.17, 0.12, 0.025, 0.01),
          0xe5c872,
          head,
          true,
        );
        capPanel.position.set(0, 0.23, 0.36);
        const hood = part(ball(0.28), 0xe6d5a5, group, true);
        hood.position.set(0, 1.75, 0.16);
        hood.scale.set(1.25, 0.5, 0.7);
        const pack = part(
          rounded(0.52, 0.59, 0.28, 0.13),
          0xee8f72,
          group,
          true,
        );
        pack.position.set(0, 1.43, 0.32);
        const pocket = part(
          rounded(0.39, 0.23, 0.09, 0.045),
          0xffbb91,
          group,
          true,
        );
        pocket.position.set(0, 1.28, 0.5);
        const zip = part(
          rounded(0.26, 0.02, 0.025, 0.006),
          0xc86c54,
          group,
          true,
        );
        zip.position.set(0, 1.39, 0.55);
        const badge = part(ball(0.075), C.ivory, group, true);
        badge.position.set(0.13, 1.57, 0.48);
        badge.scale.z = 0.2;
        for (const side of [-1, 1]) {
          const strap = part(
            rounded(0.07, 0.55, 0.07, 0.02),
            0xd58162,
            group,
            true,
          );
          strap.position.set(side * 0.26, 1.46, 0.29);
          strap.rotation.z = side * 0.07;
        }
      } else {
        const hair = part(
          ball(0.38),
          [0x594638, 0x424651, 0x886c4f][offset % 3],
          head,
          false,
        );
        hair.scale.set(1, offset % 4 === 0 ? 0.85 : 0.64, 1);
        hair.position.set(0, 0.18, 0.045);
      }
      const hips: THREE.Group[] = [],
        knees: THREE.Group[] = [],
        shoulders: THREE.Group[] = [],
        elbows: THREE.Group[] = [];
      for (const side of [-1, 1]) {
        const shoulder = new THREE.Group();
        shoulder.position.set(side * 0.39, 1.66, 0);
        group.add(shoulder);
        shoulders.push(shoulder);
        const upperArm = part(capsule(0.13, 0.22), shirt, shoulder, main);
        upperArm.position.y = -0.17;
        const elbow = new THREE.Group();
        elbow.position.y = -0.37;
        shoulder.add(elbow);
        elbows.push(elbow);
        const sleeve = part(
          capsule(0.105, 0.18),
          main ? 0xeee1b8 : skin,
          elbow,
          main,
        );
        sleeve.position.y = -0.14;
        if (main) {
          const hand = part(ball(0.115), skin, elbow, true);
          hand.position.set(0, -0.31, 0);
        }
        const hip = new THREE.Group();
        hip.position.set(side * 0.18, 1.03, 0);
        group.add(hip);
        hips.push(hip);
        const thigh = part(capsule(0.145, 0.23), trousers, hip, main);
        thigh.position.y = -0.21;
        const knee = new THREE.Group();
        knee.position.y = -0.44;
        hip.add(knee);
        knees.push(knee);
        const shin = part(capsule(0.115, 0.22), trousers, knee, main);
        shin.position.y = -0.19;
        const shoe = part(rounded(0.3, 0.19, 0.5, 0.075), C.ivory, knee, main);
        shoe.position.set(0, -0.43, -0.09);
        if (main) {
          const sole = part(
            rounded(0.31, 0.055, 0.5, 0.02),
            0xd4d9c9,
            knee,
            true,
          );
          sole.position.set(0, -0.51, -0.09);
          const stripe = part(
            rounded(0.1, 0.07, 0.18, 0.025),
            0x73b690,
            knee,
            true,
          );
          stripe.position.set(side * 0.14, -0.43, -0.11);
        }
      }
      return {
        group,
        body,
        hips,
        knees,
        shoulders,
        elbows,
        head,
        baseX: x,
        baseZ: z,
        offset,
        shirt,
        bodyRecord,
      };
    }
    const PLAYER_Z = 4;
    const player = figure(true, 0, PLAYER_Z, 0);
    const crowd: Figure[] = [];
    for (let row = 0; row < 4; row++)
      for (let column = 0; column < 4; column++) {
        const i = row * 4 + column;
        crowd.push(
          figure(
            false,
            (column - 1.5) * 1.08 + (row % 2 ? 0.16 : -0.12),
            -1.3 - row * 3.3 - (column % 2) * 0.5,
            i,
          ),
        );
      }
    const npcBatches = Array.from(npcPools, ([g, records]) => {
      const batch = instances(g, records.length, material(0xffffff));
      records.forEach((record, i) =>
        batch.setColorAt(i, colorScratch.setHex(record.color)),
      );
      return { batch, records };
    });

    // Soft grounding/contact shadows are shared across the entire cast.
    const shadowCanvas = document.createElement("canvas");
    shadowCanvas.width = shadowCanvas.height = 64;
    const shadowContext = shadowCanvas.getContext("2d");
    if (shadowContext) {
      const gradient = shadowContext.createRadialGradient(
        32,
        32,
        4,
        32,
        32,
        31,
      );
      gradient.addColorStop(0, "rgba(28,70,43,.3)");
      gradient.addColorStop(1, "rgba(28,70,43,0)");
      shadowContext.fillStyle = gradient;
      shadowContext.fillRect(0, 0, 64, 64);
    }
    const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
    textures.add(shadowTexture);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTexture,
      transparent: true,
      depthWrite: false,
      opacity: 0.8,
    });
    materials.add(shadowMat);
    const shadows = instances(
      geometry("shadow-plane", () => new THREE.PlaneGeometry(1, 1)),
      17,
      shadowMat,
    );
    shadows.renderOrder = 2;
    const playerMarker = new THREE.Group();
    scene.add(playerMarker);
    const marker = mesh(
      geometry("player-pointer", () => new THREE.ConeGeometry(0.12, 0.2, 3)),
      C.yellow,
      playerMarker,
    );
    marker.rotation.z = Math.PI;
    playerMarker.position.set(0, 3.03, PLAYER_Z);
    const selectionMat = new THREE.MeshBasicMaterial({
      color: C.green,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    materials.add(selectionMat);
    const selection = new THREE.Mesh(
      geometry("selection-ring", () => new THREE.RingGeometry(0.56, 0.63, 40)),
      selectionMat,
    );
    selection.rotation.x = -Math.PI / 2;
    selection.position.set(0, 0.055, PLAYER_Z);
    scene.add(selection);
    const rippleMat = new THREE.MeshBasicMaterial({
      color: C.green,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    materials.add(rippleMat);
    const ripple = new THREE.Mesh(
      geometry("pass-ring", () => new THREE.RingGeometry(0.8, 0.86, 40)),
      rippleMat,
    );
    ripple.rotation.x = -Math.PI / 2;
    ripple.position.set(0, 0.07, PLAYER_Z);
    scene.add(ripple);
    const particleMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.7,
      transparent: true,
      opacity: 1,
    });
    materials.add(particleMat);
    const confetti = instances(
      rounded(0.09, 0.16, 0.025, 0.009),
      32,
      particleMat,
    );
    confetti.visible = false;
    for (let i = 0; i < 32; i++)
      confetti.setColorAt(
        i,
        colorScratch.setHex([C.green, C.coral, C.yellow, C.ivory][i % 4]),
      );

    let needsRender = true;
    function resize() {
      const { width, height } = container!.getBoundingClientRect();
      camera.aspect = Math.max(width, 1) / Math.max(height, 1);
      const portrait = camera.aspect < 0.9;
      camera.fov = portrait ? 62 : 52;
      camera.position.set(0, portrait ? 6.9 : 7.1, portrait ? 12.6 : 12.9);
      camera.lookAt(0, -3, -11);
      camera.updateProjectionMatrix();
      needsRender = true;
      renderer.setSize(Math.max(width, 1), Math.max(height, 1), false);
    }
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let elapsed = 0,
      lastTime = 0,
      phaseTime = 0,
      travel = 0;
    let previousPhase = current.current.phase,
      previousQuestion = current.current.questionKey;
    let approach = Math.max(0, current.current.progress),
      didRender = false,
      stopped = false;
    function pose(f: Figure, time: number, running: boolean) {
      const cycle = time * Math.PI * RUN_STEPS_PER_SECOND + f.offset * 1.8;
      const moving = running && !reduced.matches;
      f.group.position.y =
        0.035 + (moving ? Math.abs(Math.cos(cycle)) * 0.055 : 0);
      f.body.rotation.y = moving ? Math.sin(cycle) * 0.055 : 0;
      f.head.rotation.y = moving ? -Math.sin(cycle) * 0.025 : 0;
      for (let i = 0; i < 2; i++) {
        const stride = moving ? Math.sin(cycle + i * Math.PI) : 0;
        f.hips[i].rotation.x = stride * 0.68;
        f.knees[i].rotation.x = moving ? -Math.max(0, -stride) * 0.92 : 0;
        f.shoulders[i].rotation.x = -stride * 0.72 - 0.15;
        f.shoulders[i].rotation.z = (i ? -1 : 1) * 0.08;
        f.elbows[i].rotation.x = -0.5 - Math.max(0, stride) * 0.3;
      }
    }
    function updateShadow(index: number, figure: Figure, main: boolean) {
      matrixScratch.position.set(
        figure.group.position.x,
        0.035,
        figure.group.position.z,
      );
      matrixScratch.rotation.set(-Math.PI / 2, 0, 0);
      matrixScratch.scale.set(main ? 1.55 : 1.03, main ? 1.7 : 1.15, 1);
      matrixScratch.updateMatrix();
      shadows.setMatrixAt(index, matrixScratch.matrix);
    }
    function updateWorld(shift: number) {
      for (let i = 0; i < 26; i++)
        instanceAt(
          centerDashes,
          i,
          0,
          0.016,
          14 - ((i * 4 + 104 - (shift % 104)) % 104),
        );
      centerDashes.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < 34; i++)
        instanceAt(
          paving,
          i,
          i % 2 ? 2.6 : -2.6,
          0.003,
          14 - ((Math.floor(i / 2) * 5 + 85 - (shift % 85)) % 85),
        );
      paving.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < 44; i++)
        instanceAt(
          edgeLights,
          i,
          i % 2 ? 5.14 : -5.14,
          0.05,
          14 - ((Math.floor(i / 2) * 5.2 + 114.4 - (shift % 114.4)) % 114.4),
        );
      edgeLights.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < 14; i++) {
        matrixScratch.position.set(
          i % 2 ? 2.55 : -2.55,
          0.019,
          14 - ((Math.floor(i / 2) * 12 + 84 - (shift % 84)) % 84),
        );
        matrixScratch.rotation.set(-Math.PI / 2, 0, 0);
        matrixScratch.scale.set(1, 1, 1);
        matrixScratch.updateMatrix();
        roadArrows.setMatrixAt(i, matrixScratch.matrix);
      }
      roadArrows.instanceMatrix.needsUpdate = true;
      scenery.update(shift, elapsed, reduced.matches);
    }
    const onContextLost = (event: Event) => {
      event.preventDefault();
      stopped = true;
      renderer.setAnimationLoop(null);
      setUnavailable(true);
    };
    renderer.domElement.addEventListener("webglcontextlost", onContextLost);
    let lastFootfall = 0;
    renderer.setAnimationLoop((now) => {
      if (stopped) return;
      const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.12) : 1 / 60;
      lastTime = now;
      const { phase, lane, progress, split, questionKey, paused, holding } =
        current.current;
      if (paused && didRender) {
        if (needsRender) {
          renderer.render(scene, camera);
          needsRender = false;
        }
        return;
      }
      const blend = reduced.matches ? 1 : 1 - Math.exp(-dt * 12);
      if (phase !== previousPhase) {
        phaseTime = 0;
        previousPhase = phase;
      }
      if (questionKey !== previousQuestion) {
        previousQuestion = questionKey;
        approach = Math.max(0, progress);
        phaseTime = 0;
      }
      if (!paused) phaseTime += dt;
      const moving =
        !paused && !holding && phase !== "finish" && phase !== "idle";
      const previewMoving = phase === "idle" && !paused;
      if ((moving || previewMoving) && !reduced.matches) {
        elapsed += dt;
        travel += dt * 7.0;
      }
      approach += (Math.max(0, Math.min(1.8, progress)) - approach) * blend;
      gatePair.position.z = PLAYER_Z - 44 * (1 - approach);
      gatePair.visible =
        approach < 1.005 &&
        !["choosing", "reveal", "fall", "finish"].includes(phase);
      updateGateSigns();
      updateWorld(travel);
      const oldX = player.group.position.x;
      player.group.position.x +=
        (lane * 2.35 - player.group.position.x) * blend;
      const velocity = (player.group.position.x - oldX) / Math.max(dt, 0.001);
      const playerRunning = moving && !["fall", "finish"].includes(phase);
      pose(player, elapsed, playerRunning || previewMoving);
      const footfall = Math.floor(elapsed * RUN_STEPS_PER_SECOND);
      if (footfall !== lastFootfall) {
        if (playerRunning && !reduced.matches)
          current.current.onFootstep?.(footfall % 2 ? "right" : "left");
        lastFootfall = footfall;
      }
      const targetLean =
        phase === "fall"
          ? lane >= 0
            ? 1.48
            : -1.48
          : Math.max(-0.16, Math.min(0.16, -velocity * 0.018));
      player.group.rotation.z += (targetLean - player.group.rotation.z) * blend;
      player.group.rotation.x +=
        ((phase === "fall" ? -0.62 : 0.055) - player.group.rotation.x) * blend;
      if (phase === "fall")
        player.group.position.y = reduced.matches
          ? -0.13
          : Math.max(-0.13, 0.03 - phaseTime * 0.5);
      if (phase === "finish") {
        for (let i = 0; i < 2; i++) player.shoulders[i].rotation.x = Math.PI;
        player.group.position.y += reduced.matches
          ? 0
          : Math.abs(Math.sin(phaseTime * 5)) * 0.24;
      }
      player.body.scale.y =
        1 + (reduced.matches ? 0 : Math.min(Math.abs(velocity) * 0.0025, 0.04));
      camera.position.x +=
        (player.group.position.x * 0.44 - camera.position.x) *
        (reduced.matches ? 1 : 1 - Math.exp(-dt * 7));
      camera.lookAt(camera.position.x, -3, -11);
      playerMarker.position.x = player.group.position.x;
      playerMarker.visible = phase !== "fall";
      selection.position.x = player.group.position.x;
      selectionMat.opacity = lane === 0 || phase === "fall" ? 0 : 0.5;
      selectionMat.color.setHex(lane < 0 ? C.green : C.coral);
      const sum = split ? split[0] + split[1] : 0;
      const revealing =
        !!split &&
        Number.isFinite(sum) &&
        sum > 0 &&
        ["reveal", "fall", "finish"].includes(phase);
      const leftCount = revealing
        ? Math.round(Math.max(0, Math.min(1, split![0] / sum)) * crowd.length)
        : 0;
      crowd.forEach((f, i) => {
        const left = i < leftCount;
        const inLane = left ? i : i - leftCount;
        const target = revealing
          ? (left ? -2.35 : 2.35) + ((inLane % 3) - 1) * 0.7
          : f.baseX;
        f.group.position.x +=
          (target - f.group.position.x) *
          (reduced.matches ? 1 : 1 - Math.exp(-dt * 4.5));
        f.group.position.z =
          f.baseZ -
          (revealing && !reduced.matches ? Math.min(phaseTime * 3, 7) : 0);
        pose(f, elapsed, moving || previewMoving);
        if (f.bodyRecord)
          f.bodyRecord.color = revealing
            ? left
              ? 0x80cba0
              : 0xefaa8e
            : f.shirt;
        f.group.rotation.z =
          revealing && !reduced.matches ? (left ? 0.025 : -0.025) : 0;
        f.group.updateMatrixWorld(true);
        updateShadow(i + 1, f, false);
      });
      npcBatches.forEach(({ batch, records }) => {
        records.forEach((record, i) => {
          batch.setMatrixAt(i, record.node.matrixWorld);
          batch.setColorAt(i, colorScratch.setHex(record.color));
        });
        batch.instanceMatrix.needsUpdate = true;
        if (batch.instanceColor) batch.instanceColor.needsUpdate = true;
      });
      updateShadow(0, player, true);
      shadows.instanceMatrix.needsUpdate = true;
      const celebration =
        ["reveal", "finish"].includes(phase) && !reduced.matches;
      const burst = celebration && (phase === "finish" || phaseTime < 0.85);
      rippleMat.opacity = burst ? Math.max(0, 0.55 - phaseTime * 0.65) : 0;
      ripple.position.x = player.group.position.x;
      ripple.scale.setScalar(1 + phaseTime * 3);
      rippleMat.color.setHex(lane < 0 ? C.green : C.coral);
      confetti.visible = burst;
      if (burst) {
        const t = phase === "finish" ? phaseTime % 1.4 : phaseTime;
        for (let i = 0; i < 32; i++) {
          const angle = i * 2.399;
          const flight = Math.min(1.3, t * (0.9 + (i % 4) * 0.12));
          matrixScratch.position.set(
            player.group.position.x + Math.cos(angle) * flight * 2.1,
            1.1 + Math.sin(flight * Math.PI) * (1.3 + (i % 3) * 0.4),
            PLAYER_Z + Math.sin(angle) * flight * 1.8,
          );
          matrixScratch.scale.setScalar(Math.max(0, 1 - flight * 0.5));
          matrixScratch.rotation.set(
            flight * 7 + i,
            flight * 9,
            i + flight * 8,
          );
          matrixScratch.updateMatrix();
          confetti.setMatrixAt(i, matrixScratch.matrix);
        }
        confetti.instanceMatrix.needsUpdate = true;
      }
      renderer.render(scene, camera);
      needsRender = false;
      if (!didRender) {
        didRender = true;
        current.current.onReady?.();
      }
    });
    return () => {
      stopped = true;
      observer.disconnect();
      renderer.setAnimationLoop(null);
      renderer.domElement.removeEventListener(
        "webglcontextlost",
        onContextLost,
      );
      scenery.dispose();
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      sun.shadow.map?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [props.category]);

  return (
    <div
      ref={host}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
      }}
      role="img"
      aria-label="緑の帽子のランナーと色とりどりの群衆が、二つの答えが書かれたゲートへ走る3Dゲーム"
    >
      {unavailable && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeContent: "center",
            textAlign: "center",
            padding: 24,
            background: "linear-gradient(#9bdfe5,#edf4df)",
            color: "#245c47",
          }}
        >
          <div aria-hidden="true" style={{ fontSize: 64 }}>
            {props.gateBadges?.[0] ?? "A"}　🏃　{props.gateBadges?.[1] ?? "B"}
          </div>
          <strong style={{ fontSize: 21, marginTop: 18 }}>
            あなたなら、どっちへ走る？
          </strong>
          <span style={{ fontSize: 14, lineHeight: 1.8, marginTop: 12 }}>
            左右のボタンで、そのまま遊べます
          </span>
        </div>
      )}
    </div>
  );
}

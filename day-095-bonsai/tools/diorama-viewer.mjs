// 担当C「卓・鉢・土・苔・石・和紙の壁」の見た目確認用ビューア（開発専用・本番非配信）。
// URL引数: pot (oval-brown|round-blue|rect-grey), light (morning|noon|evening|night),
//         gfx (high|low|test), cam (az,pol,dist), seed, moisture, season.

import * as THREE from '../vendor/three.js';
import { CAMERA_DEFAULT, DEFAULTS } from '../lib/contract.js';
import { createDiorama } from '../lib/diorama.js';

const LIGHT_PRESETS = {
  morning: {
    azDeg: -35, elDeg: 28, sunColor: '#fff1dc', sunIntensity: 2.6,
    skyColor: '#dfe8f5', groundColor: '#8c7a63', hemiIntensity: 0.9,
    exposure: 0.95, bgTop: '#efe9dd', bgBot: '#d8cdb8',
  },
  noon: {
    azDeg: -20, elDeg: 52, sunColor: '#fffaf0', sunIntensity: 3.2,
    skyColor: '#dfe8f5', groundColor: '#8c7a63', hemiIntensity: 0.8,
    exposure: 1.0, bgTop: '#f3eee3', bgBot: '#e5dccb',
  },
  evening: {
    azDeg: 60, elDeg: 14, sunColor: '#ffb877', sunIntensity: 2.4,
    skyColor: '#ffd9b8', groundColor: '#6e5640', hemiIntensity: 0.6,
    exposure: 1.05, bgTop: '#f1d7b5', bgBot: '#c99a72',
  },
  night: {
    azDeg: -25, elDeg: 42, sunColor: '#8da4d6', sunIntensity: 0.6,
    skyColor: '#2a3350', groundColor: '#12141c', hemiIntensity: 0.5,
    exposure: 1.1, bgTop: '#1d2233', bgBot: '#0e111b', lantern: true,
  },
};

function buildPmremEnvironment(renderer, preset) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(preset.skyColor);

  const domeMat = new THREE.MeshBasicMaterial({ color: preset.skyColor, side: THREE.BackSide });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(12, 16, 12), domeMat);
  envScene.add(dome);

  const floorMat = new THREE.MeshBasicMaterial({ color: preset.groundColor, side: THREE.DoubleSide });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), floorMat);
  floor.rotation.x = Math.PI * 0.5;
  floor.position.y = -2;
  envScene.add(floor);

  // 釉薬に美しいハイライトが映り込むよう、窓明かりの明るい面を置く
  const windowLight = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 5),
    new THREE.MeshBasicMaterial({ color: preset.sunColor, side: THREE.DoubleSide }),
  );
  windowLight.position.set(-4, 5, 6);
  windowLight.lookAt(0, 0, 0);
  envScene.add(windowLight);

  const target = pmrem.fromScene(envScene);
  pmrem.dispose();
  dome.geometry.dispose();
  domeMat.dispose();
  floor.geometry.dispose();
  floorMat.dispose();
  windowLight.geometry.dispose();
  windowLight.material.dispose();
  return target.texture;
}

function buildTreeMarker() {
  const markerGroup = new THREE.Group();
  markerGroup.name = 'treeMarker';

  // 木の根元（y=0）から高さ2.6まで伸びる細い円柱の目印
  const trunkMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#6b5a4d'),
    roughness: 0.85,
    metalness: 0.02,
  });
  const trunkGeom = new THREE.CylinderGeometry(0.05, 0.13, 2.4, 16);
  trunkGeom.translate(0, 1.2, 0);
  const trunk = new THREE.Mesh(trunkGeom, trunkMat);
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  markerGroup.add(trunk);

  // 根元の位置（y=0）を示す小さな輪
  const collarGeom = new THREE.TorusGeometry(0.15, 0.02, 10, 24);
  collarGeom.rotateX(Math.PI * 0.5);
  collarGeom.translate(0, 0.015, 0);
  const collarMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c4452c'), roughness: 0.6 });
  const collar = new THREE.Mesh(collarGeom, collarMat);
  markerGroup.add(collar);

  return markerGroup;
}

function main() {
  const params = new URLSearchParams(window.location.search);
  const potId = params.get('pot') || DEFAULTS.pot;
  const lightId = params.get('light') || DEFAULTS.light;
  const gfx = params.get('gfx') || 'high';
  const seed = Number(params.get('seed') || 11);
  const moisture = params.has('moisture') ? Number(params.get('moisture')) : 0.55;
  const season = params.get('season') || 'autumn';

  const camParam = params.get('cam');
  let az = CAMERA_DEFAULT.az;
  let pol = CAMERA_DEFAULT.pol;
  let dist = CAMERA_DEFAULT.dist;
  let targetY = CAMERA_DEFAULT.target[1];
  if (camParam) {
    const parts = camParam.split(',').map(Number);
    if (parts.length >= 3 && parts.every(Number.isFinite)) {
      [az, pol, dist] = parts;
    }
    if (parts.length >= 4 && Number.isFinite(parts[3])) {
      targetY = parts[3];
    }
  }

  const preset = LIGHT_PRESETS[lightId] || LIGHT_PRESETS.noon;
  document.body.style.background = `linear-gradient(180deg, ${preset.bgTop} 0%, ${preset.bgBot} 100%)`;

  const canvas = document.getElementById('stage');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: gfx !== 'test', alpha: true });
  const dpr = gfx === 'test' ? 1 : Math.min(window.devicePixelRatio || 1, gfx === 'low' ? 1.25 : 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = preset.exposure;
  renderer.shadowMap.enabled = gfx !== 'test';
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.environment = buildPmremEnvironment(renderer, preset);

  const camera = new THREE.PerspectiveCamera(33, window.innerWidth / window.innerHeight, 0.2, 60);
  const azRad = (az * Math.PI) / 180;
  const polRad = (pol * Math.PI) / 180;
  const target = new THREE.Vector3(CAMERA_DEFAULT.target[0], targetY, CAMERA_DEFAULT.target[2]);
  camera.position.set(
    target.x + dist * Math.sin(polRad) * Math.sin(azRad),
    target.y + dist * Math.cos(polRad),
    target.z + dist * Math.sin(polRad) * Math.cos(azRad),
  );
  camera.lookAt(target);

  // 環境光と主光源（影つき）
  const hemi = new THREE.HemisphereLight(preset.skyColor, preset.groundColor, preset.hemiIntensity);
  scene.add(hemi);

  const dirLight = new THREE.DirectionalLight(preset.sunColor, preset.sunIntensity);
  const sunAz = (preset.azDeg * Math.PI) / 180;
  const sunEl = (preset.elDeg * Math.PI) / 180;
  dirLight.position.set(
    Math.cos(sunEl) * Math.sin(sunAz) * 9,
    Math.sin(sunEl) * 9,
    Math.cos(sunEl) * Math.cos(sunAz) * 9,
  );
  dirLight.castShadow = gfx !== 'test';
  const shadowSize = gfx === 'high' ? 2048 : 1024;
  dirLight.shadow.mapSize.set(shadowSize, shadowSize);
  dirLight.shadow.camera.near = 1;
  dirLight.shadow.camera.far = 22;
  dirLight.shadow.camera.left = -4.5;
  dirLight.shadow.camera.right = 4.5;
  dirLight.shadow.camera.top = 4.5;
  dirLight.shadow.camera.bottom = -2.5;
  dirLight.shadow.bias = -0.0005;
  scene.add(dirLight);

  if (preset.lantern) {
    const lantern = new THREE.PointLight('#ffb35a', 4.5, 10, 1.6);
    lantern.position.set(2.0, 1.8, 1.6);
    scene.add(lantern);
  }

  // 舞台の構築
  const diorama = createDiorama(THREE, { gfx, seed });
  diorama.setPot(potId);
  diorama.setMoisture(moisture);
  diorama.setLook({ season, color: [0.85, 0.27, 0.16] });
  scene.add(diorama.group);

  // 木の根元（treeAnchor）に目印の細い円柱を据える
  const marker = buildTreeMarker();
  diorama.treeAnchor.add(marker);

  renderer.render(scene, camera);

  const hud = document.getElementById('hud');
  if (hud) {
    hud.textContent = `鉢: ${potId} / 光: ${lightId} / 画質: ${gfx} / tableY: ${diorama.info.tableY.toFixed(2)} / potTopY: ${diorama.info.potTopY.toFixed(2)}`;
  }

  window.__diorama = diorama;
  window.__ready = true;
  document.body.dataset.ready = 'true';
}

main();

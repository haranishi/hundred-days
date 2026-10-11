import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CAUSES, layoutGraph, shortScale } from './model.mjs';

const SVG_NS = 'http://www.w3.org/2000/svg';
const svgElement = (name, attributes = {}) => {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
};

export class BreachGraph {
  constructor(stage, mount, labels, onSelect, onUnavailable) {
    this.stage = stage;
    this.mount = mount;
    this.labelsElement = labels;
    this.onSelect = onSelect;
    this.onUnavailable = onUnavailable;
    this.mode = '3d';
    this.items = [];
    this.objects = [];
    this.labels = new Map();
    this.selected = null;
    this.frame = null;
    this.flatZoom = 1;
    this.flatPan = { x: 0, y: 0 };
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 1, 20000);
    this.camera.position.set(30, 25, 780);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.25));
    const light = new THREE.DirectionalLight(0xdbe6ff, 2.5);
    light.position.set(-150, 300, 400);
    this.scene.add(light);
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.vector = new THREE.Vector3();
    this.svg = svgElement('svg', { class: 'svg-fallback', 'aria-hidden': 'true' });
    this.mount.append(this.svg);
    try {
      this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.domElement.tabIndex = 0;
      this.renderer.domElement.setAttribute('aria-label', '3D企業マップ。矢印キーで回転、プラスとマイナスで拡大縮小。企業は一覧またはラベルから選択できます。');
      this.mount.append(this.renderer.domElement);
      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = false;
      this.controls.enablePan = false;
      this.controls.minDistance = 250;
      this.controls.maxDistance = 18000;
      this.controls.rotateSpeed = 0.65;
      this.controls.zoomSpeed = 0.8;
      this.controls.addEventListener('change', () => this.requestRender());
      this.renderer.domElement.addEventListener('webglcontextlost', event => {
        event.preventDefault();
        this.fail3D();
      });
      this.renderer.domElement.addEventListener('pointerdown', event => { this.pressStart = { x: event.clientX, y: event.clientY }; });
      this.renderer.domElement.addEventListener('pointerup', event => {
        if (this.pressStart && Math.hypot(event.clientX - this.pressStart.x, event.clientY - this.pressStart.y) < 7) this.pick(event);
        this.pressStart = null;
      });
      this.renderer.domElement.addEventListener('pointermove', event => {
        const hit = this.hitTest(event);
        this.renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';
        if (this.hovered !== hit?.userData.id) { this.hovered = hit?.userData.id || null; this.requestRender(); }
      });
      this.renderer.domElement.addEventListener('pointerleave', () => { this.hovered = null; this.requestRender(); });
      this.renderer.domElement.addEventListener('keydown', event => this.key3D(event));
      this.available3D = true;
    } catch {
      this.available3D = false;
      this.mode = '2d';
    }
    this.svg.tabIndex = 0;
    this.svg.setAttribute('aria-hidden', 'false');
    this.svg.setAttribute('role', 'img');
    this.svg.setAttribute('aria-label', '2D企業マップ。矢印キーで移動、プラスとマイナスで拡大縮小。企業は一覧またはラベルから選択できます。');
    this.svg.style.touchAction = 'none';
    this.flatPointers = new Map();
    this.svg.addEventListener('wheel', event => {
      if (this.mode !== '2d') return;
      event.preventDefault();
      this.flatZoom = THREE.MathUtils.clamp(this.flatZoom * Math.exp(-event.deltaY * 0.001), 0.5, 3.5);
      this.requestRender();
    }, { passive: false });
    this.svg.addEventListener('pointerdown', event => {
      this.svg.setPointerCapture(event.pointerId);
      this.flatPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.flatPointers.size === 2) {
        this.flatGesture = true;
        const [a, b] = [...this.flatPointers.values()];
        this.flatPinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.flatZoom };
        this.flatPress = null;
        return;
      }
      this.flatPress = { x: event.clientX, y: event.clientY, panX: this.flatPan.x, panY: this.flatPan.y };
    });
    this.svg.addEventListener('pointermove', event => {
      if (this.flatPointers.has(event.pointerId)) this.flatPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.flatPinch && this.flatPointers.size === 2) {
        const [a, b] = [...this.flatPointers.values()];
        this.flatZoom = THREE.MathUtils.clamp(this.flatPinch.zoom * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, this.flatPinch.distance), 0.5, 3.5);
        this.requestRender();
        return;
      }
      if (!this.flatPress) return;
      this.flatPan = { x: this.flatPress.panX + event.clientX - this.flatPress.x, y: this.flatPress.panY + event.clientY - this.flatPress.y };
      this.requestRender();
    });
    this.svg.addEventListener('pointerup', event => {
      this.flatPointers.delete(event.pointerId);
      if (this.flatGesture) { if (this.flatPointers.size < 2) this.flatPinch = null; if (!this.flatPointers.size) this.flatGesture = false; this.flatPress = null; return; }
      const moved = this.flatPress && Math.hypot(event.clientX - this.flatPress.x, event.clientY - this.flatPress.y) >= 7;
      this.flatPress = null;
      if (!moved) {
        const node = this.svgHitTest(event);
        if (node) this.onSelect(node.id);
      }
    });
    this.svg.addEventListener('pointercancel', event => { this.flatPointers.delete(event.pointerId); this.flatPress = null; this.flatPinch = null; if (!this.flatPointers.size) this.flatGesture = false; });
    this.svg.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'ArrowLeft') this.flatPan.x -= 30;
      if (event.key === 'ArrowRight') this.flatPan.x += 30;
      if (event.key === 'ArrowUp') this.flatPan.y -= 30;
      if (event.key === 'ArrowDown') this.flatPan.y += 30;
      if (['+', '='].includes(event.key)) this.flatZoom = Math.min(3.5, this.flatZoom * 1.15);
      if (event.key === '-') this.flatZoom = Math.max(0.5, this.flatZoom / 1.15);
      this.requestRender();
    });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.stage);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.requestRender(); });
    this.syncMode();
  }

  fail3D() {
    const mapHadFocus = document.activeElement === this.renderer?.domElement;
    this.available3D = false;
    this.setMode('2d');
    this.onUnavailable?.();
    if (mapHadFocus) this.svg.focus({ preventScroll: true });
  }

  syncMode() {
    this.svg.style.display = this.mode === '2d' ? 'block' : 'none';
    if (this.renderer) this.renderer.domElement.style.display = this.mode === '3d' ? 'block' : 'none';
    this.stage.dataset.renderer = this.mode === '3d' ? 'webgl' : 'svg';
    this.stage.dataset.mode = this.mode;
  }

  setMode(mode) {
    this.mode = mode === '3d' && this.available3D ? '3d' : '2d';
    this.syncMode();
    this.setData(this.items);
    this.fit();
  }

  clearObjects() {
    for (const object of this.objects) {
      object.geometry?.dispose();
      if (Array.isArray(object.material)) object.material.forEach(material => material.dispose());
      else object.material?.dispose();
    }
    this.objects = [];
    this.group.clear();
    this.labelsElement.replaceChildren();
    this.labels.clear();
    this.svg.replaceChildren();
  }

  setData(items, uniformScale = this.uniformScale || false) {
    this.items = items;
    this.uniformScale = uniformScale;
    this.clearObjects();
    this.layoutCompact = this.stage.clientWidth < 520;
    this.layout = layoutGraph(items, this.mode === '2d', this.layoutCompact, uniformScale);
    this.labelPriority = new Set(items.slice(0, this.layoutCompact ? 6 : 10).map(item => item.id));
    this.pickables = [];
    const positions = this.layout.nodes.map(node => node.position);
    this.bounds = {
      minX: Math.min(-100, ...positions.map(p => p[0])) - 70,
      maxX: Math.max(100, ...positions.map(p => p[0])) + 70,
      minY: Math.min(-80, ...positions.map(p => p[1])) - 85,
      maxY: Math.max(80, ...positions.map(p => p[1])) + 65,
    };
    for (const hub of this.layout.hubs) {
      this.addLine([0, 0, 0], hub.position, hub.color, 0.18);
      this.addPoint(hub.position, 4, hub.color, false, null);
      const label = document.createElement('span');
      label.className = 'hub-label';
      label.style.setProperty('--hub-color', hub.color);
      label.textContent = hub.short;
      this.labelsElement.append(label);
      this.labels.set(hub.id, { element: label, position: hub.position, radius: 0, hub: true });
    }
    for (const node of this.layout.nodes) {
      const hub = this.layout.hubs.find(h => h.id === node.cause);
      const color = CAUSES[node.cause].color;
      this.addLine(hub.position, node.position, color, 0.28, node.id);
      this.addPoint(node.position, node.radius, color, node.status !== 'confirmed' || node.scale.value === null, node.id);
      const label = document.createElement('button');
      label.type = 'button';
      label.className = 'node-label';
      label.dataset.nodeId = node.id;
      label.setAttribute('aria-label', `${node.shortName}、${shortScale(node.scale)}、${node.status === 'reported' ? '当局への届出' : node.status === 'possible' ? '可能性を含む' : node.status === 'notice' ? '公表・報道記録' : '資料で確認あり'}。企業ノートを開く`);
      const title = document.createElement('strong');
      title.textContent = node.id === 'universal-music-store-2025' ? 'ユニバーサル音楽' : node.shortName;
      const count = document.createElement('span');
      count.textContent = shortScale(node.scale);
      if (node.status === 'possible') {
        const marker = document.createElement('span');
        marker.className = 'potential-marker';
        marker.textContent = ' ○';
        count.append(marker);
      }
      label.append(title, count);
      label.addEventListener('click', () => this.onSelect(node.id));
      this.labelsElement.append(label);
      this.labels.set(node.id, { id: node.id, element: label, position: node.position, radius: node.radius, hub: false });
    }
    if (items.length) {
      this.addPoint([0, 0, 0], 2.3, '#9eaac0', false, null);
      const rootLabel = document.createElement('span');
      rootLabel.className = 'hub-label root-label';
      rootLabel.textContent = '公表事例';
      this.labelsElement.append(rootLabel);
      this.labels.set('root', { element: rootLabel, position: [0, 0, 0], radius: 0, hub: true });
    }
    this.select(this.selected);
    this.resize();
    this.fit();
  }

  addLine(from, to, color, opacity, id = null) {
    if (this.mode === '2d') {
      const line = svgElement('line', { x1: from[0], y1: -from[1], x2: to[0], y2: -to[1], stroke: color, 'stroke-width': 1.1, opacity, 'vector-effect': 'non-scaling-stroke' });
      if (id) line.dataset.edgeId = id;
      this.svg.append(line);
      return;
    }
    const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...from), new THREE.Vector3(...to)]);
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
    line.userData.edgeId = id;
    this.group.add(line);
    this.objects.push(line);
  }

  addPoint(position, radius, color, hollow, id) {
    if (this.mode === '2d') {
      const circle = svgElement('circle', { cx: position[0], cy: -position[1], r: radius, fill: hollow ? color : color, 'fill-opacity': hollow ? 0.035 : 0.42, stroke: color, 'stroke-width': 1.2, 'vector-effect': 'non-scaling-stroke' });
      if (id) circle.dataset.circleId = id;
      this.svg.append(circle);
      return;
    }
    const geometry = new THREE.SphereGeometry(radius, 20, 14);
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.68, metalness: 0.12, transparent: true, opacity: hollow ? 0.07 : 0.62, depthWrite: !hollow });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.userData.id = id;
    this.group.add(mesh);
    this.objects.push(mesh);
    if (id) this.pickables.push(mesh);
    if (id) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 1.04, radius * 1.075, 64), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: hollow ? 0.82 : 0.48, side: THREE.DoubleSide, depthWrite: false }));
      ring.position.copy(mesh.position);
      ring.userData.ringId = id;
      this.group.add(ring);
      this.objects.push(ring);
    }
  }

  select(id) {
    this.selected = id;
    for (const [nodeId, label] of this.labels) {
      if (!label.hub) label.element.setAttribute('aria-pressed', nodeId === id ? 'true' : 'false');
    }
    if (this.mode === '3d') {
      for (const object of this.objects) {
        if (object.userData.ringId) {
          const active = object.userData.ringId === id;
          object.material.color.set(active ? '#efdefc' : CAUSES[this.items.find(item => item.id === object.userData.ringId).cause].color);
          object.material.opacity = active ? 1 : 0.55;
          object.scale.setScalar(active ? 1.18 : 1);
        }
        if (object.userData.edgeId) object.material.opacity = object.userData.edgeId === id ? 0.8 : 0.25;
      }
    } else {
      for (const circle of this.svg.querySelectorAll('[data-circle-id]')) circle.setAttribute('stroke-width', circle.dataset.circleId === id ? '2.5' : '1.2');
      for (const edge of this.svg.querySelectorAll('[data-edge-id]')) edge.setAttribute('opacity', edge.dataset.edgeId === id ? '0.8' : '0.25');
    }
    this.requestRender();
  }

  fit() {
    if (!this.bounds) return;
    if (this.mode === '2d') {
      this.flatZoom = 1;
      this.flatPan = { x: 0, y: 0 };
    } else {
      const width = this.bounds.maxX - this.bounds.minX;
      const height = this.bounds.maxY - this.bounds.minY;
      const fit = Math.max(height / (2 * Math.tan(THREE.MathUtils.degToRad(21))), width / (2 * Math.tan(THREE.MathUtils.degToRad(21)) * this.camera.aspect));
      const center = new THREE.Vector3((this.bounds.minX + this.bounds.maxX) / 2, (this.bounds.minY + this.bounds.maxY) / 2, 0);
      this.controls.target.copy(center);
      this.camera.position.copy(center).add(new THREE.Vector3(fit * 0.025, fit * 0.035, fit * 1.04));
      this.controls.update();
    }
    this.requestRender();
  }

  resize() {
    this.width = this.stage.clientWidth;
    this.height = this.stage.clientHeight;
    if (!this.width || !this.height) return;
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer?.setSize(this.width, this.height);
    if (this.layout && (this.width < 520) !== this.layoutCompact) { this.setData(this.items); return; }
    this.fit();
  }

  requestRender() {
    if (this.frame || document.hidden) return;
    this.frame = requestAnimationFrame(() => { this.frame = null; this.render(); });
  }

  flatTransform() {
    const worldWidth = this.bounds.maxX - this.bounds.minX;
    const worldHeight = this.bounds.maxY - this.bounds.minY;
    const scale = Math.min(this.width / worldWidth, (this.height - 45) / worldHeight) * this.flatZoom;
    const centerX = (this.bounds.minX + this.bounds.maxX) / 2;
    const centerY = (this.bounds.minY + this.bounds.maxY) / 2;
    return { scale, centerX, centerY };
  }

  render() {
    if (!this.layout || !this.width || !this.height) return;
    if (this.mode === '3d') {
      for (const object of this.objects) if (object.userData.ringId) object.quaternion.copy(this.camera.quaternion);
      this.renderer.render(this.scene, this.camera);
    } else {
      const { scale, centerX, centerY } = this.flatTransform();
      this.svg.setAttribute('viewBox', `${centerX - (this.width / 2 + this.flatPan.x) / scale} ${-centerY - ((this.height - 35) / 2 + this.flatPan.y) / scale} ${this.width / scale} ${this.height / scale}`);
    }
    const projected = [];
    for (const label of this.labels.values()) {
      const show = label.hub || this.items.length <= 12 || this.labelPriority.has(label.id) || label.id === this.selected || label.id === this.hovered;
      label.element.style.visibility = show ? 'visible' : 'hidden';
      if (!label.hub) label.element.tabIndex = show ? 0 : -1;
      if (!show) continue;
      let x, y, radius;
      if (this.mode === '3d') {
        this.vector.set(...label.position).project(this.camera);
        x = (this.vector.x + 1) / 2 * this.width;
        y = (-this.vector.y + 1) / 2 * this.height;
        const distance = this.camera.position.distanceTo(new THREE.Vector3(...label.position));
        radius = label.radius * this.height / (2 * Math.tan(THREE.MathUtils.degToRad(21)) * distance);
        label.element.style.visibility = this.vector.z > 1 ? 'hidden' : 'visible';
      } else {
        const { scale, centerX, centerY } = this.flatTransform();
        x = (label.position[0] - centerX) * scale + this.width / 2 + this.flatPan.x;
        y = -(label.position[1] - centerY) * scale + (this.height - 35) / 2 + this.flatPan.y;
        radius = label.radius * scale;
        label.element.style.visibility = 'visible';
      }
      projected.push({ label, x, y, radius: radius * (label.element.getAttribute('aria-pressed') === 'true' ? 1.18 : 1), width: label.element.offsetWidth, height: label.element.offsetHeight });
    }
    const used = [];
    const circles = projected.filter(point => !point.label.hub);
    for (const point of projected.filter(point => point.label.hub)) {
      const candidates = [{ x: point.x, y: point.y - 17 }, { x: point.x, y: point.y + 17 }, { x: point.x - point.width / 2 - 12, y: point.y }, { x: point.x + point.width / 2 + 12, y: point.y }];
      const score = candidate => {
        const rect = { left: candidate.x - point.width / 2 - 3, right: candidate.x + point.width / 2 + 3, top: candidate.y - point.height / 2 - 3, bottom: candidate.y + point.height / 2 + 3 };
        let penalty = Math.max(0, 5 - rect.left) + Math.max(0, rect.right - this.width + 5) + Math.max(0, 5 - rect.top) + Math.max(0, rect.bottom - this.height + 49);
        penalty *= 100;
        for (const other of circles) {
          const distance = Math.hypot(other.x - Math.max(rect.left, Math.min(rect.right, other.x)), other.y - Math.max(rect.top, Math.min(rect.bottom, other.y)));
          penalty += Math.max(0, other.radius + 4 - distance) * 40;
        }
        for (const other of used) penalty += Math.max(0, Math.min(rect.right, other.right) - Math.max(rect.left, other.left)) * Math.max(0, Math.min(rect.bottom, other.bottom) - Math.max(rect.top, other.top));
        return penalty;
      };
      const best = candidates.reduce((best, candidate) => score(candidate) < score(best) ? candidate : best);
      point.label.element.style.left = `${best.x}px`;
      point.label.element.style.top = `${best.y}px`;
      used.push({ left: best.x - point.width / 2 - 3, right: best.x + point.width / 2 + 3, top: best.y - point.height / 2 - 3, bottom: best.y + point.height / 2 + 3 });
    }
    for (const point of circles.sort((a, b) => Number(b.label.id === this.selected || b.label.id === this.hovered) - Number(a.label.id === this.selected || a.label.id === this.hovered) || b.radius - a.radius)) {
      if (point.x < -25 || point.x > this.width + 25 || point.y < -25 || point.y > this.height + 25) { point.label.element.style.visibility = 'hidden'; continue; }
      const candidates = [
        { x: point.x, y: point.y + point.radius + 6 },
        { x: point.x, y: point.y - point.radius - point.height - 6 },
        { x: point.x + point.radius + point.width / 2 + 6, y: point.y - point.height / 2 },
        { x: point.x - point.radius - point.width / 2 - 6, y: point.y - point.height / 2 },
      ];
      const score = candidate => {
        const rect = { left: candidate.x - point.width / 2, right: candidate.x + point.width / 2, top: candidate.y, bottom: candidate.y + point.height };
        let penalty = Math.max(0, 7 - rect.left) + Math.max(0, rect.right - this.width + 7) + Math.max(0, 7 - rect.top) + Math.max(0, rect.bottom - this.height + 49);
        penalty *= 100;
        for (const other of used) {
          const overlapWidth = Math.max(0, Math.min(rect.right, other.right) - Math.max(rect.left, other.left));
          const overlapHeight = Math.max(0, Math.min(rect.bottom, other.bottom) - Math.max(rect.top, other.top));
          penalty += overlapWidth * overlapHeight;
        }
        for (const other of circles) {
          if (other === point) continue;
          const distance = Math.hypot(other.x - Math.max(rect.left, Math.min(rect.right, other.x)), other.y - Math.max(rect.top, Math.min(rect.bottom, other.y)));
          penalty += Math.max(0, other.radius + 5 - distance) * 40;
        }
        return penalty;
      };
      const best = candidates.reduce((best, candidate) => score(candidate) < score(best) ? candidate : best);
      if (this.items.length > 12 && point.label.id !== this.selected && point.label.id !== this.hovered && score(best) > 80) { point.label.element.style.visibility = 'hidden'; point.label.element.tabIndex = -1; continue; }
      point.label.element.style.left = `${best.x}px`;
      point.label.element.style.top = `${best.y}px`;
      used.push({ left: best.x - point.width / 2 - 3, right: best.x + point.width / 2 + 3, top: best.y - 3, bottom: best.y + point.height + 3 });
    }
    this.stage.dataset.rendered = 'true';
  }

  hitTest(event) {
    if (this.mode !== '3d') return null;
    const box = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObjects(this.pickables, false)[0]?.object || null;
  }

  pick(event) {
    const hit = this.hitTest(event);
    if (hit) this.onSelect(hit.userData.id);
  }

  svgHitTest(event) {
    const box = this.svg.getBoundingClientRect();
    const { scale, centerX, centerY } = this.flatTransform();
    const x = (event.clientX - box.left - this.width / 2 - this.flatPan.x) / scale + centerX;
    const y = -(event.clientY - box.top - (this.height - 35) / 2 - this.flatPan.y) / scale + centerY;
    return this.layout.nodes.find(node => Math.hypot(node.position[0] - x, node.position[1] - y) <= node.radius + 5);
  }

  key3D(event) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-'].includes(event.key)) return;
    event.preventDefault();
    const offset = this.camera.position.clone().sub(this.controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    if (event.key === 'ArrowLeft') spherical.theta -= 0.12;
    if (event.key === 'ArrowRight') spherical.theta += 0.12;
    if (event.key === 'ArrowUp') spherical.phi -= 0.12;
    if (event.key === 'ArrowDown') spherical.phi += 0.12;
    if (['+', '='].includes(event.key)) spherical.radius = Math.max(250, spherical.radius / 1.15);
    if (event.key === '-') spherical.radius = Math.min(18000, spherical.radius * 1.15);
    spherical.phi = THREE.MathUtils.clamp(spherical.phi, 0.15, Math.PI - 0.15);
    this.camera.position.copy(this.controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
    this.controls.update();
    this.requestRender();
  }
}

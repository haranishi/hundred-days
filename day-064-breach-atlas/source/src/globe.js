import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { geographicPosition, projectedPosition, LOCATIONS, GLOBE_COLORS } from './geo-model.mjs';
const NS = 'http://www.w3.org/2000/svg';
const svg = (name, attributes = {}) => {
  const element = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
};
const count = value => new Intl.NumberFormat('ja-JP').format(value);

export class BreachGlobe {
  constructor(stage, mount, labels, land, onSelect, onUnavailable) {
    this.stage = stage; this.mount = mount; this.labels = labels;
    this.land = land.polygons; this.onSelect = onSelect; this.onUnavailable = onUnavailable;
    this.mode = '3d'; this.groups = []; this.markers = []; this.frame = null;
    this.flatZoom = 1; this.flatPan = { x: 0, y: 0 };
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 1, 1600);
    this.scene.add(new THREE.AmbientLight(0xc4eeff, 1.2));
    const light = new THREE.DirectionalLight(0xc2f9ef, 2);
    light.position.set(-100, 250, -200); this.scene.add(light);
    this.markerGroup = new THREE.Group(); this.scene.add(this.markerGroup);
    this.raycaster = new THREE.Raycaster(); this.pointer = new THREE.Vector2();
    this.vector = new THREE.Vector3();
    this.flat = svg('svg', { class: 'globe-flat', role: 'img', tabindex: '0', 'aria-label': '地域別の公表記録の平面地図。矢印キーで移動、プラス・マイナスで拡大縮小。地域は選択欄からも開けます。' });
    this.mount.append(this.flat);
    this.buildEarth();
    try {
      this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
      this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
      this.renderer.setClearColor(0x000000, 0);
      const canvas = this.renderer.domElement;
      canvas.tabIndex = 0; canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', '公表記録の地球儀。ドラッグまたは矢印キーで回転、プラス・マイナスで拡大縮小。光点は地域の代表点です。地域は選択欄からも開けます。');
      this.mount.append(canvas);
      this.controls = new OrbitControls(this.camera, canvas);
      this.controls.enablePan = false; this.controls.enableDamping = false;
      this.controls.minDistance = 160; this.controls.maxDistance = 800; this.controls.rotateSpeed = .55;
      this.controls.addEventListener('change', () => this.requestRender());
      canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); this.fail3D(); });
      canvas.addEventListener('pointerdown', event => { this.press = { x: event.clientX, y: event.clientY }; });
      canvas.addEventListener('pointerup', event => {
        if (this.press && Math.hypot(event.clientX - this.press.x, event.clientY - this.press.y) < 7) {
          const hit = this.hit(event); if (hit) this.onSelect(hit);
        }
        this.press = null;
      });
      canvas.addEventListener('pointercancel', () => { this.press = null; });
      canvas.addEventListener('pointermove', event => { canvas.style.cursor = this.hit(event) ? 'pointer' : 'grab'; });
      canvas.addEventListener('keydown', event => this.key(event));
      this.available3D = true;
    } catch { this.available3D = false; this.mode = '2d'; }
    this.bindFlat(); this.syncMode(); this.fit();
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(stage);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.requestRender(); });
  }

  buildEarth() {
    const canvas = document.createElement('canvas'); canvas.width = 2048; canvas.height = 1024;
    const context = canvas.getContext('2d');
    context.fillStyle = '#071b2b'; context.fillRect(0, 0, canvas.width, canvas.height);
    this.paintLand(context, 2.048, '#153c4a');
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(100, 96, 64), new THREE.MeshPhongMaterial({ map: texture, shininess: 8, specular: 0x1b4d61 }));
    this.scene.add(this.earth);
    const coordinates = [];
    for (const polygon of this.land) for (const ring of polygon) for (let i = 1; i < ring.length; i++) {
      if (Math.abs(ring[i][0] - ring[i - 1][0]) > 180) continue;
      coordinates.push(...geographicPosition(ring[i - 1][1], ring[i - 1][0], 100.15), ...geographicPosition(ring[i][1], ring[i][0], 100.15));
    }
    const coastline = new THREE.BufferGeometry(); coastline.setAttribute('position', new THREE.Float32BufferAttribute(coordinates, 3));
    this.scene.add(new THREE.LineSegments(coastline, new THREE.LineBasicMaterial({ color: 0x3d9398, transparent: true, opacity: .6 })));
    const grid = [];
    for (let lon = -180; lon < 180; lon += 20) for (let lat = -90; lat < 90; lat += 3) grid.push(...geographicPosition(lat, lon, 100.1), ...geographicPosition(lat + 3, lon, 100.1));
    for (let lat = -60; lat <= 60; lat += 20) for (let lon = -180; lon < 180; lon += 3) grid.push(...geographicPosition(lat, lon, 100.1), ...geographicPosition(lat, lon + 3, 100.1));
    const graticule = new THREE.BufferGeometry(); graticule.setAttribute('position', new THREE.Float32BufferAttribute(grid, 3));
    this.scene.add(new THREE.LineSegments(graticule, new THREE.LineBasicMaterial({ color: 0x397b88, transparent: true, opacity: .2 })));
    const mask = document.createElement('canvas'); mask.width = 1000; mask.height = 500;
    const maskContext = mask.getContext('2d'); this.paintLand(maskContext, 1, '#ffffff');
    const pixels = maskContext.getImageData(0, 0, 1000, 500).data;
    const dots = [];
    for (let i = 0; i < 22000; i++) {
      const lat = Math.asin(1 - 2 * (i + .5) / 22000) * 180 / Math.PI;
      const lon = ((i * 137.507764) % 360) - 180;
      const [x, y] = projectedPosition(lat, lon);
      if (pixels[(Math.min(499, Math.floor(y)) * 1000 + Math.min(999, Math.floor(x))) * 4 + 3] > 0) dots.push(...geographicPosition(lat, lon, 100.3));
    }
    const pointGeometry = new THREE.BufferGeometry(); pointGeometry.setAttribute('position', new THREE.Float32BufferAttribute(dots, 3));
    this.scene.add(new THREE.Points(pointGeometry, new THREE.PointsMaterial({ color: 0x51a6aa, size: .6, transparent: true, opacity: .6 })));
    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(103, 64, 40), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec3 normalView; varying vec3 viewDirection; void main(){vec4 p=modelViewMatrix*vec4(position,1.0);normalView=normalize(normalMatrix*normal);viewDirection=normalize(-p.xyz);gl_Position=projectionMatrix*p;}',
      fragmentShader: 'varying vec3 normalView; varying vec3 viewDirection; void main(){float rim=pow(1.0-max(dot(normalize(normalView),normalize(viewDirection)),0.0),3.5);gl_FragColor=vec4(0.18,0.68,0.76,rim*0.45);}',
    }));
    this.scene.add(atmosphere);
  }

  paintLand(context, scale, color) {
    context.fillStyle = color;
    for (const polygon of this.land) {
      context.beginPath();
      for (const ring of polygon) {
        ring.forEach(([lon, lat], index) => { const [x, y] = projectedPosition(lat, lon); if (index) context.lineTo(x * scale, y * scale); else context.moveTo(x * scale, y * scale); });
        context.closePath();
      }
      context.fill('evenodd');
    }
  }

  setData(groups) {
    this.groups = groups;
    for (const object of this.markerGroup.children) { object.geometry?.dispose(); object.material?.dispose(); }
    this.markerGroup.clear(); this.markers = []; this.labels.replaceChildren();
    for (const group of groups) {
      const cause = Object.entries(group.causes).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
      const color = GLOBE_COLORS[cause], position = new THREE.Vector3(...geographicPosition(group.lat, group.lon, 101));
      const size = 1.4 + Math.min(2.3, Math.log10(group.count + 1) * .7);
      const point = new THREE.Mesh(new THREE.SphereGeometry(size, 12, 8), new THREE.MeshBasicMaterial({ color }));
      point.position.copy(position); point.userData.code = group.code; this.markerGroup.add(point);
      const ring = new THREE.Mesh(new THREE.RingGeometry(size * 1.65, size * 2, 28), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .7, side: THREE.DoubleSide }));
      ring.position.copy(position); ring.lookAt(position.clone().multiplyScalar(2)); this.markerGroup.add(ring);
      const tip = position.clone().normalize().multiplyScalar(106 + Math.min(24, Math.log10(group.count + 1) * 6));
      const line = new THREE.BufferGeometry().setFromPoints([position, tip]);
      this.markerGroup.add(new THREE.Line(line, new THREE.LineBasicMaterial({ color, transparent: true, opacity: .8 })));
      const label = document.createElement('button'); label.type = 'button'; label.className = 'globe-point-label';
      label.dataset.geoCode = group.code; label.style.setProperty('--point-color', color);
      label.textContent = `${group.label} · ${count(group.count)}`;
      label.setAttribute('aria-label', `${group.label}、${count(group.count)}記録で絞り込み`);
      label.addEventListener('click', () => this.onSelect(group.code)); this.labels.append(label);
      this.markers.push({ group, point, ring, label, position: tip });
    }
    this.renderFlat(); this.requestRender();
  }

  select(code) {
    this.selected = code;
    for (const marker of this.markers) marker.label.setAttribute('aria-pressed', String(marker.group.code === code));
    this.requestRender();
  }

  focus(code = 'JP', close = false) {
    const location = LOCATIONS[code] || LOCATIONS.JP;
    if (this.mode === '3d') {
      this.camera.position.set(...geographicPosition(location.lat + (close ? 0 : -8), location.lon, close ? 225 : 335));
      this.camera.lookAt(0, 0, 0); this.controls?.update();
    } else {
      this.flatZoom = close ? 4 : 1.3;
      const [x, y] = projectedPosition(location.lat, location.lon);
      this.flatPan = { x: (500 - x) * this.flatZoom, y: (250 - y) * this.flatZoom };
    }
    this.requestRender();
  }

  zoom(factor) {
    if (this.mode === '3d') { this.camera.position.setLength(THREE.MathUtils.clamp(this.camera.position.length() / factor, 160, 800)); this.controls?.update(); }
    else this.flatZoom = THREE.MathUtils.clamp(this.flatZoom * factor, .75, 8);
    this.requestRender();
  }

  fit() {
    if (this.mode === '3d') this.focus('JP', false);
    else { this.flatZoom = 1; this.flatPan = { x: 0, y: 0 }; this.requestRender(); }
  }

  syncMode() {
    this.flat.style.display = this.mode === '2d' ? 'block' : 'none';
    this.flat.setAttribute('aria-hidden', String(this.mode !== '2d'));
    if (this.renderer) this.renderer.domElement.hidden = this.mode !== '3d';
    this.labels.hidden = this.mode !== '3d';
    this.stage.dataset.renderer = this.mode === '3d' ? 'webgl' : 'svg'; this.stage.dataset.mode = this.mode;
  }

  setMode(mode) { this.mode = mode === '3d' && this.available3D ? '3d' : '2d'; this.syncMode(); this.fit(); }
  fail3D() {
    const focused = document.activeElement === this.renderer?.domElement;
    this.available3D = false; this.setMode('2d'); this.onUnavailable?.();
    if (focused) this.flat.focus({ preventScroll: true });
  }

  resize() {
    this.width = this.stage.clientWidth; this.height = this.stage.clientHeight;
    if (!this.width || !this.height) return;
    this.camera.aspect = this.width / this.height; this.camera.updateProjectionMatrix();
    this.renderer?.setSize(this.width, this.height, false); this.requestRender();
  }

  requestRender() {
    if (this.frame || !this.stage.getClientRects().length || document.hidden) return;
    this.frame = requestAnimationFrame(() => { this.frame = null; this.render(); });
  }

  render() {
    if (!this.width || !this.height) return;
    if (this.mode === '2d') {
      const width = 1000 / this.flatZoom, height = 500 / this.flatZoom;
      this.flat.setAttribute('viewBox', `${500 - width / 2 - this.flatPan.x / this.flatZoom} ${250 - height / 2 - this.flatPan.y / this.flatZoom} ${width} ${height}`);
    } else {
      this.renderer.render(this.scene, this.camera);
      const shown = [];
      for (const marker of [...this.markers].sort((a, b) => (b.group.code === this.selected) - (a.group.code === this.selected) || b.group.count - a.group.count)) {
        this.vector.copy(marker.position).project(this.camera);
        const x = (this.vector.x * .5 + .5) * this.width, y = (-this.vector.y * .5 + .5) * this.height;
        const front = marker.position.clone().normalize().dot(this.camera.position.clone().normalize()) > .15;
        const visible = front && x > 75 && x < this.width - 75 && y > (this.width < 500 ? 100 : 60) && y < this.height - 80 && shown.length < 5 && !shown.some(point => Math.abs(point.x - x) < 130 && Math.abs(point.y - y) < 42);
        marker.label.hidden = !visible;
        if (visible) { marker.label.style.left = `${x}px`; marker.label.style.top = `${y}px`; shown.push({ x, y }); }
      }
    }
    this.stage.dataset.rendered = 'true';
  }

  hit(event) {
    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObjects([this.earth, ...this.markers.map(marker => marker.point)])[0]?.object.userData.code || null;
  }

  renderFlat() {
    this.flat.replaceChildren();
    const grid = svg('g', { class: 'flat-grid' });
    for (let lon = -180; lon <= 180; lon += 30) { const [x] = projectedPosition(0, lon); grid.append(svg('line', { x1: x, y1: 0, x2: x, y2: 500 })); }
    for (let lat = -60; lat <= 60; lat += 30) { const [, y] = projectedPosition(lat, 0); grid.append(svg('line', { x1: 0, y1: y, x2: 1000, y2: y })); }
    this.flat.append(grid);
    for (const polygon of this.land) {
      const path = polygon.map(ring => ring.map(([lon, lat], index) => { const [x, y] = projectedPosition(lat, lon); return `${index ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`; }).join(' ') + ' Z').join(' ');
      this.flat.append(svg('path', { d: path, class: 'flat-land', 'fill-rule': 'evenodd' }));
    }
    for (const group of this.groups) {
      const [x, y] = projectedPosition(group.lat, group.lon), radius = 2.5 + Math.log10(group.count + 1);
      const cause = Object.entries(group.causes).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
      const point = svg('circle', { cx: x, cy: y, r: radius, fill: GLOBE_COLORS[cause], 'data-geo-code': group.code, class: 'flat-point' });
      const title = svg('title'); title.textContent = `${group.label}・${count(group.count)}記録`; point.append(title);
      this.flat.append(point);
    }
  }

  bindFlat() {
    this.pointers = new Map();
    this.flat.addEventListener('wheel', event => { event.preventDefault(); this.zoom(Math.exp(-event.deltaY * .001)); }, { passive: false });
    this.flat.addEventListener('pointerdown', event => {
      this.flat.setPointerCapture(event.pointerId); this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()]; this.pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.flatZoom }; this.flatPress = null; this.hadPinch = true;
      } else this.flatPress = { x: event.clientX, y: event.clientY, pan: { ...this.flatPan } };
    });
    this.flat.addEventListener('pointermove', event => {
      if (!this.pointers.has(event.pointerId)) return;
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.pinch && this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()]; this.flatZoom = THREE.MathUtils.clamp(this.pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, this.pinch.distance), .75, 8);
      } else if (this.flatPress) {
        const scale = 1000 / Math.max(1, this.width);
        this.flatPan = { x: this.flatPress.pan.x + (event.clientX - this.flatPress.x) * scale, y: this.flatPress.pan.y + (event.clientY - this.flatPress.y) * scale };
      }
      this.requestRender();
    });
    this.flat.addEventListener('pointerup', event => {
      const moved = this.flatPress && Math.hypot(event.clientX - this.flatPress.x, event.clientY - this.flatPress.y) >= 7;
      if (!moved && !this.hadPinch) {
        const matrix = this.flat.getScreenCTM(), point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
        const closest = this.groups.map(group => ({ group, point: projectedPosition(group.lat, group.lon) })).sort((a, b) => Math.hypot(a.point[0] - point.x, a.point[1] - point.y) - Math.hypot(b.point[0] - point.x, b.point[1] - point.y))[0];
        if (closest && Math.hypot(closest.point[0] - point.x, closest.point[1] - point.y) < 14 / this.flatZoom) this.onSelect(closest.group.code);
      }
      this.pointers.delete(event.pointerId); this.flatPress = null; this.pinch = null;
      if (!this.pointers.size) this.hadPinch = false;
    });
    this.flat.addEventListener('pointercancel', event => { this.pointers.delete(event.pointerId); this.flatPress = null; this.pinch = null; if (!this.pointers.size) this.hadPinch = false; });
    this.flat.addEventListener('keydown', event => this.key(event));
  }

  key(event) {
    if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-'].includes(event.key)) return;
    event.preventDefault();
    if (['+','='].includes(event.key)) this.zoom(1.2);
    else if (event.key === '-') this.zoom(1 / 1.2);
    else if (this.mode === '2d') {
      if (event.key === 'ArrowLeft') this.flatPan.x += 25;
      if (event.key === 'ArrowRight') this.flatPan.x -= 25;
      if (event.key === 'ArrowUp') this.flatPan.y += 25;
      if (event.key === 'ArrowDown') this.flatPan.y -= 25;
    } else {
      const position = new THREE.Spherical().setFromVector3(this.camera.position);
      if (event.key === 'ArrowLeft') position.theta -= .14;
      if (event.key === 'ArrowRight') position.theta += .14;
      if (event.key === 'ArrowUp') position.phi = Math.max(.15, position.phi - .12);
      if (event.key === 'ArrowDown') position.phi = Math.min(Math.PI - .15, position.phi + .12);
      this.camera.position.setFromSpherical(position); this.camera.lookAt(0, 0, 0); this.controls?.update();
    }
    this.requestRender();
  }
}

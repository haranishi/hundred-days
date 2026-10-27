import * as THREE from '../vendor/three.module.js';

// Original procedural miniatures. Dimensions are shared so every item fits the inspection tray.
export function createItemModel(item = {}) {
  const root = new THREE.Group();
  const shell = new THREE.Group();
  const inside = new THREE.Group();
  inside.visible = false;
  root.add(shell, inside);
  const materials = [];
  const textures = [];
  const P = {
    pearl: mat(0xf4f0df, .3), ink: mat(0x213f3c, .42), rubber: mat(0x273432, .85),
    metal: mat(0xc6d1d0, .25, .85), chrome: mat(0xe2e8e4, .18, .95),
    mint: mat(0x85b8a1, .38), blue: mat(0x4f8fb4, .35), orange: mat(0xda814a, .45),
    yellow: mat(0xdfc448, .45), red: mat(0xa94836, .4), dark: mat(0x142a2b, .3),
    paper: mat(0xeee6cf, .8), white: mat(0xf4f8ed, .48)
  };
  function mat(color, roughness = .4, metalness = 0) {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    materials.push(m);
    return m;
  }
  function mesh(geometry, material, xyz, parent = shell) {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(...xyz);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function box(w, h, d, material, x = 0, y = h / 2, z = 0, radius = .045, parent = shell) {
    const r = Math.min(radius, w / 3, h / 3, d / 3);
    const shape = new THREE.Shape();
    const l = -w / 2, b = -h / 2;
    shape.moveTo(l + r, b); shape.lineTo(l + w - r, b);
    shape.quadraticCurveTo(l + w, b, l + w, b + r); shape.lineTo(l + w, b + h - r);
    shape.quadraticCurveTo(l + w, b + h, l + w - r, b + h); shape.lineTo(l + r, b + h);
    shape.quadraticCurveTo(l, b + h, l, b + h - r); shape.lineTo(l, b + r);
    shape.quadraticCurveTo(l, b, l + r, b);
    const g = new THREE.ExtrudeGeometry(shape, { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r * .5, bevelSegments: 2, steps: 1, curveSegments: 4 });
    g.translate(0, 0, -d / 2 + r);
    return mesh(g, material, [x, y, z], parent);
  }
  function cyl(top, bottom, height, material, x = 0, y = height / 2, z = 0, parent = shell, segments = 28) {
    return mesh(new THREE.CylinderGeometry(top, bottom, height, segments), material, [x, y, z], parent);
  }
  function ring(radius, tube, material, x, y, z, parent = shell) {
    const m = mesh(new THREE.TorusGeometry(radius, tube, 8, 30), material, [x, y, z], parent);
    m.rotation.x = Math.PI / 2;
    return m;
  }
  function label(text, sub, w, d, x = 0, y = .205, z = 0, bg = '#f0ecdf', fg = '#253b37', parent = shell) {
    if (typeof document === 'undefined') return;
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, 512, 256);
    ctx.strokeStyle = fg; ctx.lineWidth = 2; ctx.strokeRect(14, 14, 484, 228);
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 58px system-ui, sans-serif'; ctx.fillText(String(text).slice(0, 20), 256, sub ? 94 : 128);
    if (sub) { ctx.font = '400 24px system-ui, sans-serif'; ctx.fillText(String(sub).slice(0, 30), 256, 164); }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; textures.push(tex);
    const m = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, toneMapped: false }); materials.push(m);
    const p = mesh(new THREE.PlaneGeometry(w, d), m, [x, y + .03, z], parent);
    p.rotation.x = -Math.PI / 2; p.castShadow = false; p.userData.isLabel = true;
    return p;
  }
  function button(x, y, z, radius = .025, color = P.mint) { return cyl(radius, radius, .012, color, x, y, z); }
  function bottle({ color = P.mint, x = 0, z = 0, r = .23, h = .64, cap = P.pearl, text = 'LOTION', sub = '150 ml' } = {}) {
    cyl(r, r * .92, h * .72, color, x, h * .36, z);
    cyl(r * .47, r, h * .14, color, x, h * .79, z);
    cyl(r * .46, r * .46, h * .15, cap, x, h * .925, z);
    const l = label(text, sub, r * 1.55, h * .32, x, h * .43, z + r + .003);
    if (l) l.rotation.x = 0;
  }
  function handleBattery() {
    const giant = item.icon === 'battery-huge';
    if (giant) {
      box(1.25, .62, .68, P.dark, 0, .31, 0, .07);
      box(1.05, .12, .08, P.rubber, 0, .78, 0, .03);
      box(.08, .24, .08, P.rubber, -.47, .66); box(.08, .24, .08, P.rubber, .47, .66);
      box(.48, .21, .018, P.ink, -.2, .34, .352, .01);
      const l = label('200 Wh', 'PORTABLE POWER', .42, .19, -.2, .35, .366, '#183d39', '#c8f48e'); if (l) l.rotation.x = 0;
      for (const x of [.28, .43]) { const m = cyl(.046, .046, .012, P.chrome, x, .32, .35); m.rotation.x = Math.PI / 2; }
      for (let i = 0; i < 5; i++) box(.025, .28, .013, P.rubber, -.48 + i * .2, .28, -.35, .006);
    } else {
      const camera = item.id === 'spare-lithium-camera';
      box(camera ? .85 : 1.23, camera ? .3 : .22, .64, camera ? P.dark : P.pearl, 0, camera ? .15 : .11, 0, .055);
      box(.035, camera ? .3 : .21, .57, P.metal, .48, .11, 0, .01);
      for (let i = 0; i < 3; i++) box(.09, .025, .08, P.chrome, -.2 + i * .13, camera ? .309 : .23, -.22, .005);
      box(.16, .06, .018, P.dark, .3, .12, .335, .01);
      for (let i = 0; i < 4; i++) button(-.28 + i * .09, .235, .205, .014, P.mint);
      const rating = item.id === 'powerbank-140wh' ? '140 Wh' : camera ? '60 Wh' : item.id === 'hair-iron-removed-battery' ? '≤100 Wh' : '37 Wh';
      label(rating, 'LITHIUM-ION / POWER', camera ? .63 : .85, .33, -.05, camera ? .31 : .235, -.02);
    }
  }
  function lighter(x = 0, z = 0, turbo = false) {
    box(.35, .16, .8, turbo ? P.dark : P.orange, x, .08, z, .055);
    box(.37, .18, .23, P.metal, x, .09, z - .33, .035);
    const wheel = cyl(.078, .078, .13, P.dark, x - .05, .22, z - .32, shell, 12); wheel.rotation.z = Math.PI / 2;
    box(.1, .08, .15, P.red, x + .1, .17, z - .25, .015);
    label(turbo ? 'JET' : 'GAS', 'CAUTION', .23, .3, x, .169, z + .13, turbo ? '#244844' : '#d87a40');
  }
  function iron(corded) {
    for (const side of [-1, 1]) {
      const p = box(.22, .13, 1.37, P.dark, side * .14, .095, 0, .045); p.rotation.y = side * .085;
      const plate = box(.13, .018, .61, P.metal, side * .13, .17, -.3, .015); plate.rotation.y = side * .085;
    }
    cyl(.14, .14, .19, P.mint, 0, .095, .6);
    button(.14, .184, .29, .032, P.yellow);
    if (corded) {
      const points = [new THREE.Vector3(0, .09, .68),new THREE.Vector3(.35, .06, .78),new THREE.Vector3(.5, .055, .43),new THREE.Vector3(.66, .06, .58)];
      mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 16, .018, 7, false), P.rubber, [0,0,0]);
      box(.18, .11, .22, P.rubber, .68, .08, .61, .025);
      for (const x of [.64,.72]) box(.022,.025,.09,P.metal,x,.075,.77,.005);
    }
  }
  switch (item.icon) {
    case 'battery': case 'battery-huge': handleBattery(); break;
    case 'lighter':
      if (item.id === 'lighter-multiple') { lighter(-.45,.12); lighter(0,-.06); lighter(.45,.08); }
      else lighter();
      break;
    case 'lighter-turbo': lighter(0,0,true); break;
    case 'match':
      box(.96, .19, .6, P.paper, 0, .095, 0, .024);
      box(.92, .15, .61, P.red, 0, .105, 0, .018);
      label(item.id === 'strike-anywhere-match' ? 'MATCHES' : 'SAFETY', 'KEEP DRY', .78, .45, 0, .188);
      box(.85,.11,.015,P.rubber,0,.09,.315,.005);
      for (let i=0;i<4;i++) { box(.03,.035,.36,P.paper,-.28+i*.16,.235,-.02,.006); cyl(.025,.025,.04,P.red,-.28+i*.16,.24,-.2); }
      break;
    case 'vape':
      box(.38,.23,1.19,P.ink,0,.115,0,.07);box(.3,.19,.2,P.rubber,0,.12,-.65,.035);
      box(.12,.015,.3,P.metal,0,.244,.11,.02); button(0,.25,-.17,.045,P.mint);
      label('DEVICE','LI-ION',.24,.25,0,.248,.4,'#244844','#d3e8cf'); break;
    case 'earphone':
      box(1.12,.3,.72,P.pearl,0,.15,0,.14); box(1.13,.035,.7,P.ink,0,.235,0,.07);
      box(1.11,.12,.7,P.pearl,0,.31,0,.12); button(0,.385,.23,.018,P.mint);
      for (const x of [-.25,.25]) { const l=mesh(new THREE.SphereGeometry(.115,20,12),P.white,[x,.43,-.02]);l.scale.set(1,.8,1);box(.09,.06,.23,P.white,x,.425,.1,.035); }
      break;
    case 'fan': {
      box(.24,.13,.66,P.mint,0,.08,.3,.055);
      ring(.38,.045,P.pearl,0,.17,-.28);
      cyl(.33,.33,.08,P.mint,0,.15,-.28);
      for (let i=0;i<6;i++) {const blade=box(.1,.03,.63,P.pearl,0,.215,-.28,.02);blade.rotation.y=i*Math.PI/6;}
      cyl(.1,.1,.035,P.metal,0,.245,-.28);button(0,.154,.43,.035,P.white);break;
    }
    case 'scissors':
      for (const side of [-1,1]) {
        ring(.19,.055,P.ink,side*.255,.075,.37);
        const b=box(.13,.05,.92,P.chrome,side*.16,.095,-.15,.015); b.rotation.y=-side*.27;
        const edge=box(.035,.055,.81,P.metal,side*.18,.1,-.21,.006);edge.rotation.y=-side*.27;
      }
      cyl(.055,.055,.075,P.orange,0,.135,.12);break;
    case 'cutter':
      if (item.id === 'swiss-knife') {
        box(.42,.17,1,P.red,0,.09,.1,.07); label('+','SWISS TOOL',.28,.4,0,.183,.16,'#a94836','#f2eee2');
        const blade=box(.16,.035,.69,P.chrome,.15,.13,-.52,.015);blade.rotation.y=-.27;
        ring(.075,.018,P.metal,0,.12,.66);
      } else if (item.id === 'souvenir-kitchen-knife') {
        box(.64,.12,1.42,P.paper,0,.065,0,.025);
        box(.23,.07,.52,P.ink,0,.17,.39,.02); box(.32,.045,.8,P.chrome,0,.155,-.23,.025);
        label('KITCHEN','16 cm',.42,.3,0,.14,.43,'#e8debe');
      } else {
        box(.33,.13,1.18,P.yellow,0,.07,.06,.04);box(.12,.04,.91,P.metal,0,.16,-.1,.01);
        box(.2,.05,.25,P.rubber,0,.19,.2,.015);box(.13,.025,.35,P.chrome,0,.15,-.67,.008);
        for(let i=0;i<5;i++) box(.24,.02,.016,P.orange,0,.145,.35+i*.07,.004);
      }break;
    case 'bottle': bottle();break;
    case 'jar':
      cyl(.39,.32,.45,P.orange,0,.225);cyl(.41,.41,.06,P.pearl,0,.48);
      label('PUDDING','180 g',.55,.43,0,.514);break;
    case 'tool': {
      if (item.id === 'camp-peg-hammer') {
        box(.17, .15, 1.2, P.ink, 0, .095, .15, .04);
        box(.73, .25, .27, P.metal, 0, .16, -.45, .025);
        box(.19, .27, .3, P.dark, -.34, .16, -.45, .02);
        for (let i = 0; i < 6; i++) box(.185, .02, .025, P.orange, 0, .178, .34 + i * .07, .007);
        box(.055, .065, .77, P.chrome, .43, .06, .14, .01);
        box(.16, .065, .055, P.chrome, .38, .06, -.25, .01);
        break;
      }
      const shaft=box(.065,.065,.9,P.chrome,.21,.085,-.27,.01);shaft.rotation.y=-.22;
      const handle=box(.22,.18,.52,P.ink,.33,.11,.39,.055);handle.rotation.y=-.22;
      const wrench=box(.15,.09,1.25,P.metal,-.29,.07,0,.035);wrench.rotation.y=.22;
      ring(.145,.055,P.chrome,-.42,.09,-.58);ring(.12,.045,P.chrome,-.17,.09,.58);break;
    }
    case 'bat': {
      const bat=cyl(.11,.045,1.45,P.metal,0,.13);bat.rotation.x=Math.PI/2;bat.rotation.z=-.25;
      const grip=cyl(.05,.05,.42,P.rubber,.13,.13,.52);grip.rotation.x=Math.PI/2;grip.rotation.z=-.25;
      for(let i=0;i<6;i++) ring(.05,.007,P.pearl,.13,.13,.39+i*.045);break;
    }
    case 'ice':
      box(1.2,.19,.85,P.blue,0,.11,0,.1);box(1.15,.025,.8,P.mint,0,.215,0,.06);
      label('COOL PACK','250 g / GEL',.9,.57,0,.235,0,'#98cbd7','#224c63');break;
    case 'hair-iron': iron(false);break;
    case 'plug': iron(true);break;
    case 'gas':
      cyl(.3,.3,.67,P.orange,0,.335);cyl(.23,.3,.1,P.chrome,0,.72);cyl(.06,.06,.1,P.metal,0,.82);
      {const l=label('LPG','250 g',.39,.28,0,.39,.306,'#e7a36d');if(l)l.rotation.x=0;}break;
    case 'spray-danger': case 'spray-ok': {
      const safe=item.icon==='spray-ok';
      cyl(.245,.245,.66,safe?P.mint:P.yellow,0,.33);cyl(.19,.245,.08,P.metal,0,.7);cyl(.09,.09,.12,P.pearl,0,.79);
      box(.045,.04,.06,P.dark,0,.81,.09,.005);
      const l=label(safe?'CARE':'WATERPROOF',safe?'200 ml':'300 ml',.35,.3,0,.4,.249,safe?'#b5cec0':'#dfc448');if(l)l.rotation.x=0;
      break;
    }
    case 'bottle-danger':
      bottle({color:item.id==='chlorine-bleach'?P.white:P.pearl,cap:P.red,h:.85,r:.28,text:item.id==='chlorine-bleach'?'BLEACH':'96%',sub:item.id==='chlorine-bleach'?'CORROSIVE':'500 ml'});
      break;
    case 'fireworks':
      for (let i=0;i<5;i++) {
        const stick=box(.025,.025,1.24,P.paper,-.4+i*.2,.07,0,.005);stick.rotation.y=(i-2)*.09;
        const coating=box(.055,.05,.72,i%2?P.red:P.orange,-.4+i*.2,.09,-.24,.01);coating.rotation.y=(i-2)*.09;
      }
      box(1.24,.02,.13,P.blue,0,.16,.36,.005);break;
    case 'pouch': {
      const glass=mat(0xcde4dc,.2); glass.transparent=true;glass.opacity=.22;glass.depthWrite=false;
      box(1.35,.64,.55,glass,0,.32,0,.04);
      box(1.35,.04,.57,P.mint,0,.66,0,.01);box(.12,.05,.08,P.pearl,.4,.69,.29,.01);
      for(let i=0;i<3;i++) bottle({x:(i-1)*.37,z:0,r:.12,h:.53,color:i%2?P.blue:P.pearl,text:'100',sub:'ml'});
      break;
    }
    case 'wine':
      bottle({color:mat(0x285942,.24),cap:P.red,h:.89,r:.25,text:'VINTAGE',sub:'15% / 750 ml'});break;
    case 'clipper':
      box(.3,.12,1.05,P.chrome,0,.07,0,.035);
      {const lever=box(.2,.045,.9,P.metal,0,.185,.03,.025);lever.rotation.x=-.12;}
      box(.32,.05,.16,P.dark,0,.105,-.49,.015);ring(.07,.015,P.metal,0,.16,.59);break;
    case 'medicine':
      box(.64,.05,1.12,P.chrome,-.27,.03,0,.035);
      for(let x=0;x<2;x++)for(let z=0;z<4;z++) {const pill=mesh(new THREE.SphereGeometry(.085,16,10),P.pearl,[-.41+x*.27,.1,-.4+z*.26]);pill.scale.y=.6;}
      bottle({x:.4,z:.08,color:P.mint,cap:P.blue,r:.15,h:.54,text:'EYE',sub:'15 ml'});break;
    default: box(1,.3,.7,P.mint,0,.15);label('BAGGAGE','INSPECTION',.74,.43,0,.315);
  }

  // Center the complete miniature and fit its longest dimension without cutting off attachments.
  shell.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(shell);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  shell.position.set(-center.x, -bounds.min.y, -center.z);
  const scale = Math.min(1, 1.65 / Math.max(size.x,.01), 1.24 / Math.max(size.z,.01), .96 / Math.max(size.y,.01));
  shell.scale.setScalar(scale);
  // Translation is expressed in the same local scale as the object's vertices.
  shell.position.multiplyScalar(scale);

  const xmat = new THREE.MeshBasicMaterial({color:0x6ef4e6,transparent:true,opacity:.13,depthWrite:false,side:THREE.DoubleSide});
  materials.push(xmat);
  const amber = new THREE.MeshStandardMaterial({color:0xffc366,emissive:0xd77912,emissiveIntensity:.5,roughness:.4});materials.push(amber);
  const cyan = new THREE.LineBasicMaterial({color:0x86f9eb,transparent:true,opacity:.8});materials.push(cyan);
  const originals = [];
  shell.traverse((node)=> {
    if (!node.isMesh) return;
    originals.push({node, material:node.material, visible:node.visible});
    if (node.userData.isLabel) return;
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(node.geometry,38),cyan);
    edge.position.copy(node.position);edge.rotation.copy(node.rotation);edge.scale.copy(node.scale);
    inside.add(edge);
  });
  inside.position.copy(shell.position);inside.scale.copy(shell.scale);
  const batteryLike=['battery','battery-huge','vape','earphone','fan','hair-iron'].includes(item.icon);
  const liquidLike=['bottle','wine','bottle-danger','gas','spray-danger','spray-ok','jar','pouch','medicine','ice'].includes(item.icon);
  if(batteryLike) {
    const count=item.icon==='battery-huge'?6:3;
    for(let i=0;i<count;i++) {const c=cyl(.072,.072,.43,amber,(i-(count-1)/2)*.16,.16,0,inside,14);c.rotation.x=Math.PI/2;}
    box(.63,.025,.06,amber,0,.17,-.25,.004,inside);
  } else if(liquidLike) {
    if(item.icon==='ice') box(.85,.08,.53,amber,0,.12,0,.03,inside);
    else cyl(.16,.16,.4,amber,0,.24,0,inside,20);
  } else {
    box(.065,.04,.72,amber,0,.13,0,.01,inside);
  }
  root.userData.setXray = (enabled) => {
    inside.visible=Boolean(enabled);
    for (const entry of originals) {
      entry.node.material=enabled?xmat:entry.material;
      entry.node.visible=enabled?!entry.node.userData.isLabel:entry.visible;
      entry.node.castShadow=!enabled;
    }
  };
  root.userData.dispose = () => {
    const geometry=new Set();
    root.traverse(node=>{if(node.geometry)geometry.add(node.geometry);});
    geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
  };
  root.userData.icon=item.icon || 'unknown';
  return root;
}

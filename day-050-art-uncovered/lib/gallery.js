import * as THREE from '../vendor/three.js';
import { cropAt } from './game.js';

// Controls remain in HTML. The same artwork and crop are used by both renderers.
export class Gallery {
  constructor(host) {
    this.host = host;
    this.flat = document.getElementById('flat-view');
    this.flatFrame = document.getElementById('flat-frame');
    this.flatImage = document.getElementById('flat-image');
    this.motion = matchMedia('(prefers-reduced-motion: reduce)');
    this.request = 0;
    this.loaded = new Map();
    this.enabled = true;
    this.crop = { x: 0, y: 0, size: 1 };
    this.raf = 0;
    try { this.setup(); }
    catch { this.enabled = false; this.renderer?.dispose(); this.renderer=null; }
    this.flat.hidden = !!this.renderer && this.enabled;
    this.observer = new ResizeObserver(() => { this.resize(); this.render(); });
    this.observer.observe(host);
    this.host.addEventListener('pointermove', event => {
      if (!this.enabled || this.motion.matches || event.pointerType === 'touch') return;
      const rect = host.getBoundingClientRect();
      this.camera.position.x = ((event.clientX - rect.left) / rect.width - .5) * .15;
      this.camera.lookAt(0, 1.82, 0);
      this.render();
    });
    this.host.addEventListener('pointerleave', () => { if (this.camera) { this.camera.position.x = 0; this.camera.lookAt(0, 1.82, 0); this.render(); } });
  }

  setup() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    this.renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); this.setEnabled(false); });
    this.host.append(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#e5e6da');
    this.camera = new THREE.PerspectiveCamera(43, 1, .1, 50);
    this.scene.add(new THREE.HemisphereLight('#fff9e9', '#afac91', 2.5));
    const sun = new THREE.DirectionalLight('#fff6d5', 3.3);
    sun.position.set(-3, 6, 5);sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);sun.shadow.camera.left = -5;sun.shadow.camera.right = 5;sun.shadow.camera.top = 6;sun.shadow.camera.bottom = -3;sun.shadow.normalBias = .025;
    this.scene.add(sun);
    const matte = color => new THREE.MeshStandardMaterial({ color, roughness: .85 });
    const box = (w,h,d,x,y,z,color) => {
      const object = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), typeof color === 'string' ? matte(color) : color);
      object.position.set(x,y,z); object.receiveShadow = true;this.scene.add(object);return object;
    };
    box(16,8,.15,0,3.5,-.25,'#e9e8dc');
    box(16,.15,12,0,-.09,3,'#b1ad94');
    box(16,.12,.08,0,.11,-.13,'#8c9581');
    for (let x=-7;x<=7;x+=1.15) box(.012,.003,12,x,.001,3,'#989780');
    for(let z=0;z<10;z+=1.15)box(16,.003,.009,0,.002,z,'#989780');
    // Recessed wall panels and a high window make the frame a part of a room.
    for(const x of [-3.5,3.5]) {
      box(.12,5,.2,x,2.5,-.09,'#dcddcd');
      box(1.7,.12,.18,x + (x<0?-.8:.8),3.55,-.09,'#dcddcd');
    }
    const windowMat = new THREE.MeshBasicMaterial({ color: '#f5f0d9' });
    box(1.1,2.35,.04,-3,2.05,-.145,windowMat);
    box(.035,2.4,.05,-3,2.05,-.10,'#c3c2af');
    box(1.15,.035,.05,-3,2.05,-.10,'#c3c2af');
    // Soft light shapes on the wall; never cover the artwork.
    const lightMat = new THREE.MeshBasicMaterial({ color:'#fff8d7',transparent:true,opacity:.28,depthWrite:false });
    const light = new THREE.Mesh(new THREE.PlaneGeometry(1.1,2.8),lightMat);light.position.set(-2.18,1.75,-.159);light.rotation.z=-.22;this.scene.add(light);
    this.frame = new THREE.Group();this.frame.position.set(0,1.95,0);this.scene.add(this.frame);
    this.artMaterial = new THREE.MeshBasicMaterial({ color: '#e8e3cf', toneMapped: false });
    this.artPlane = new THREE.Mesh(new THREE.PlaneGeometry(1,1), this.artMaterial);this.artPlane.position.z = .11;this.frame.add(this.artPlane);
    this.bars = [];
    for(let i=0;i<4;i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1,1,.095),new THREE.MeshStandardMaterial({color:'#876733',metalness:.58,roughness:.42}));
      bar.position.z=.08;bar.castShadow=true;this.frame.add(bar);this.bars.push(bar);
    }
    this.mat = new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({color:'#e3d8b3',toneMapped:false}));
    this.mat.position.z=.04;this.frame.add(this.mat);
    const loader = new THREE.GLTFLoader();
    const models = [['benchCushionLow.glb',.43,[.13,0,1.15],0],['pottedPlant.glb',1.25,[1.97,0,.40],0],['lampRoundFloor.glb',1.5,[-1.95,0,.60],0]];
    this.modelsLoaded = 0;
    for(const [name,height,position,rotation] of models) {
      loader.load(`assets/models/${name}`, gltf => {
        const model = gltf.scene;
        const bounds = new THREE.Box3().setFromObject(model);const size = bounds.getSize(new THREE.Vector3());
        const s = height / size.y;
        model.scale.setScalar(s);model.position.set(position[0] - (bounds.min.x+size.x/2)*s,position[1]-bounds.min.y*s,position[2]-(bounds.min.z+size.z/2)*s);
        model.rotation.y=rotation;
        model.traverse(node=>{if(node.isMesh){node.castShadow=true;node.receiveShadow=true;}});
        this.scene.add(model);this.modelsLoaded++;this.host.dataset.modelsLoaded=String(this.modelsLoaded);this.render();
      },undefined,()=>{this.host.dataset.modelError='true';});
    }
    this.resize();
  }

  resize() {
    const w=this.host.clientWidth,h=this.host.clientHeight;
    if(!w||!h)return;
    if(this.renderer){this.renderer.setSize(w,h,false);this.camera.aspect=w/h;
      this.camera.position.set(0,2.12,Math.max(5.35,4.85/this.camera.aspect));
      this.camera.lookAt(0,1.82,0);this.camera.updateProjectionMatrix();}
    this.sizeFlat();
  }

  sizeFlat() {
    if(!this.work)return;
    const ratio=this.imageRatio||this.work.width/this.work.height;
    const mobile=this.host.clientWidth<600;
    const style=getComputedStyle(this.flatFrame);
    const horizontal=parseFloat(style.paddingLeft)+parseFloat(style.paddingRight)+parseFloat(style.borderLeftWidth)+parseFloat(style.borderRightWidth);
    const vertical=parseFloat(style.paddingTop)+parseFloat(style.paddingBottom)+parseFloat(style.borderTopWidth)+parseFloat(style.borderBottomWidth);
    const maxW=this.host.clientWidth*.88-horizontal,maxH=this.host.clientHeight-(mobile?135:180)-vertical;
    const w=Math.min(maxW,maxH*ratio);
    this.flatFrame.style.width=`${w}px`;this.flatFrame.style.height=`${w/ratio}px`;
  }

  async show(work, fraction=1, alt=work.alt) {
    const request=++this.request;
    this.work=work;this.host.setAttribute('aria-label',alt);this.flatImage.alt='';
    this.host.dataset.artwork=String(work.id);
    let image=this.loaded.get(work.id);
    if(!image){
      image=new Image();image.decoding='async';
      const ready=new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('image'));});
      image.src=work.image;
      await ready;
      if(work.displayCrop){
        const [x,y,w,h]=work.displayCrop;
        const trimmed=document.createElement('canvas');trimmed.width=Math.round(image.naturalWidth*w);trimmed.height=Math.round(image.naturalHeight*h);
        trimmed.getContext('2d').drawImage(image,image.naturalWidth*x,image.naturalHeight*y,image.naturalWidth*w,image.naturalHeight*h,0,0,trimmed.width,trimmed.height);
        const cropped=new Image();cropped.src=trimmed.toDataURL('image/png');await cropped.decode();image=cropped;
      }
      this.loaded.set(work.id,image);
    }
    if(request!==this.request)return false;
    this.flatImage.src=image.src;this.imageRatio=image.naturalWidth/image.naturalHeight;
    this.sizeFlat();
    if(this.renderer){
      const texture=new THREE.Texture(image);texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;
      texture.anisotropy=Math.min(4,this.renderer.capabilities.getMaxAnisotropy());
      this.artMaterial.map?.dispose();this.artMaterial.map=texture;this.artMaterial.color.set('#ffffff');this.artMaterial.needsUpdate=true;
      const ratio=this.imageRatio;
      const h=Math.min(2.05,2.75/ratio),w=h*ratio,b=.064,m=.085;
      this.artPlane.scale.set(w,h,1);this.mat.scale.set(w+2*m,h+2*m,1);
      this.bars[0].scale.set(w+2*m+2*b,b,1);this.bars[0].position.set(0,h/2+m+b/2,.08);
      this.bars[1].scale.copy(this.bars[0].scale);this.bars[1].position.set(0,-h/2-m-b/2,.08);
      this.bars[2].scale.set(b,h+2*m,1);this.bars[2].position.set(-w/2-m-b/2,0,.08);
      this.bars[3].scale.copy(this.bars[2].scale);this.bars[3].position.set(w/2+m+b/2,0,.08);
    }
    this.setCrop(fraction,false);return true;
  }

  setCrop(fraction,animate=true){
    if(!this.work)return;
    cancelAnimationFrame(this.raf);
    const from={...this.crop},to=cropAt(this.work.focus,fraction),start=performance.now();
    const tick=time=>{
      const t=(!animate||this.motion.matches)?1:Math.min(1,(time-start)/580);
      const eased=1-(1-t)**3;
      this.crop={x:from.x+(to.x-from.x)*eased,y:from.y+(to.y-from.y)*eased,size:from.size+(to.size-from.size)*eased};
      this.applyCrop();
      if(t<1)this.raf=requestAnimationFrame(tick);
    };tick(start);
  }

  applyCrop(){
    const {x,y,size}=this.crop;
    const texture=this.artMaterial?.map;
    if(texture){texture.repeat.set(size,size);texture.offset.set(x,1-y-size);}
    this.flatImage.style.width=`${100/size}%`;this.flatImage.style.height=`${100/size}%`;
    this.flatImage.style.left=`${-x/size*100}%`;this.flatImage.style.top=`${-y/size*100}%`;
    this.render();
  }

  setEnabled(enabled){
    this.enabled=Boolean(enabled&&this.renderer);
    this.flat.hidden=this.enabled;
    if(this.renderer)this.renderer.domElement.hidden=!this.enabled;
    const button=document.getElementById('view-toggle');
    button.setAttribute('aria-pressed',String(this.enabled));button.textContent=this.enabled?'立体展示':'平面展示';
    this.sizeFlat();this.render();return this.enabled;
  }

  render(){if(this.renderer&&this.enabled&&!document.hidden)this.renderer.render(this.scene,this.camera);}
}

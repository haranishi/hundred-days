import * as THREE from '../vendor/three.js';
import { LIGHT_SPEED } from './milestones.js';
import { worldAt } from './worlds.js';
import { catEmissiveIntensity,catLightAppearance } from './cat-light.js';
export function createCatModel(mesh=(parent,type,color,x,y,z,sx,sy,sz)=>{
  const geometry=type==='sphere'?new THREE.SphereGeometry(1,16,10):type==='cone'?new THREE.ConeGeometry(1,1,4):new THREE.BoxGeometry(1,1,1);
  const part=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,roughness:.85}));
  part.position.set(x,y,z);part.scale.set(sx,sy,sz);parent.add(part);return part;
}) {
  const cat=new THREE.Group();cat.position.set(0,.55,1);
  const body=mesh(cat,'sphere',0xf4ba76,0,.45,0,.43,.43,.85),chest=mesh(cat,'sphere',0xffe6bd,0,.53,-.52,.36,.41,.4);
  const head=new THREE.Group();head.position.set(0,.84,-.82);cat.add(head);mesh(head,'sphere',0xf4ba76,0,0,0,.43,.4,.38);
  for(const x of [-.28,.28]){const ear=mesh(head,'cone',0xeaa462,x,.37,.02,.23,.45,.22);ear.rotation.y=Math.PI/4;mesh(head,'cone',0xefaa9e,x,.39,-.05,.13,.27,.1).rotation.y=Math.PI/4;}
  mesh(head,'sphere',0xffe9ce,0,-.14,-.3,.26,.17,.13);mesh(head,'sphere',0x745348,0,-.09,-.42,.065,.045,.04);
  for(const x of [-.23,.23])mesh(head,'sphere',0x203b32,x,.04,-.29,.055,.075,.045);
  for(const x of [-1,1])for(let i=0;i<3;i++){const whisker=mesh(head,'box',0xffefd5,x*.39,-.09+i*.07,-.32,.35,.012,.012);whisker.rotation.z=x*(i-1)*.18;}
  const paws=[];for(const x of [-.27,.27])for(const z of [-.47,.5]){const leg=new THREE.Group();leg.position.set(x,.25,z);cat.add(leg);mesh(leg,'sphere',0xf4ba76,0,-.2,0,.14,.3,.15);mesh(leg,'sphere',0xffe9ce,0,-.42,-.07,.16,.12,.23);paws.push(leg);}
  const tail=new THREE.Group();tail.position.set(0,.68,.63);cat.add(tail);for(let i=0;i<5;i++)mesh(tail,'sphere',i===4?0xffe6bd:0xe7a364,0,.09*i,.19*i,.14-i*.014,.15-i*.01,.23);tail.rotation.x=-.65;
  for(let i=0;i<3;i++)mesh(cat,'box',0xc68650,0,.84,-.2+i*.29,.4,.035,.08);
  const coatMaterials=new Map();
  cat.traverse(part=>{if(part.material?.isMeshStandardMaterial&&!coatMaterials.has(part.material))coatMaterials.set(part.material,part.material.color.clone());});
  return {cat,body,chest,head,paws,tail,coatMaterials};
}

// Root is local to the cat, 0.28 below the real tail's attachment.
export function lightTrailLayout() {
  return [{root:{x:0,y:.4,z:.63},color:0xd6f775}];
}
export function createLightTrail() {
  const group=new THREE.Group();
  for(const {root,color} of lightTrailLayout()){
    const geometry=new THREE.ConeGeometry(1,1,24,8);
    // Translate the wide base to the origin and aim the tip backwards (+Z).
    geometry.translate(0,.5,0);geometry.rotateX(Math.PI/2);
    const positions=geometry.getAttribute('position'),colors=[];
    for(let i=0;i<positions.count;i++)colors.push(1,1,1,Math.max(0,1-positions.getZ(i)));
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,4));
    const material=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.75,vertexColors:true,depthWrite:false});
    const piece=new THREE.Mesh(geometry,material);piece.position.set(root.x,root.y,root.z);group.add(piece);
  }
  return group;
}

export function createScene(canvas) {
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(49,1,.1,350);camera.position.set(9,4.8,5.5);camera.lookAt(0,1,1);
  const hemi=new THREE.HemisphereLight(0xffffff,0x557c67,2.5);scene.add(hemi);const sun=new THREE.DirectionalLight(0xffefcf,3);sun.position.set(-8,14,4);scene.add(sun);
  const geometries={box:new THREE.BoxGeometry(1,1,1),sphere:new THREE.SphereGeometry(1,16,10),cone:new THREE.ConeGeometry(1,1,4),cylinder:new THREE.CylinderGeometry(1,1,1,8)},materials=new Map();
  function material(color,glow=false){const key=`${color}-${glow}`;if(!materials.has(key))materials.set(key,glow?new THREE.MeshBasicMaterial({color}):new THREE.MeshStandardMaterial({color,roughness:.85}));return materials.get(key);}
  function mesh(parent,type,color,x,y,z,sx,sy,sz,glow=false){const m=new THREE.Mesh(geometries[type],material(color,glow));m.position.set(x,y,z);m.scale.set(sx,sy,sz);parent.add(m);return m;}
  const {cat,body,chest,head,paws,tail,coatMaterials}=createCatModel(mesh);scene.add(cat);
  const haloGeometry=new THREE.RingGeometry(1.45,1.51,64),haloMaterial=new THREE.MeshBasicMaterial({color:0xd6f775,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide});
  const halo=new THREE.Mesh(haloGeometry,haloMaterial);scene.add(halo);halo.quaternion.copy(camera.quaternion);
  const trails=createLightTrail();cat.add(trails);trails.visible=false;
  const worlds={},movers=[];function world(id){const g=new THREE.Group();worlds[id]=g;scene.add(g);return g;}
  function moving(parent,object,z){object.position.z=z;parent.add(object);movers.push({object,world:parent,origin:z});return object;}
  const farm=world('farm');mesh(farm,'box',0x769a64,0,-.26,-60,250,.4,230);mesh(farm,'box',0xc4bb8e,0,-.04,-60,4,.08,230);
  for(let i=0;i<24;i++){const g=new THREE.Group(),side=i%2?1:-1;g.position.x=side*4;mesh(g,'box',0xe9dcc2,0,.45,0,.13,1,.14);mesh(g,'box',0xe9dcc2,0,.65,1.5,.1,.12,3);mesh(g,'box',0xe9dcc2,0,.3,1.5,.1,.12,3);moving(farm,g,10-i*5);}
  for(let i=0;i<9;i++){const tree=new THREE.Group();tree.position.x=(i%2?1:-1)*(9+i%3*3);mesh(tree,'cylinder',0x795742,0,.7,0,.2,1.4,.2);mesh(tree,'sphere',0x4a7650,0,2.1,0,1.2,1.6,1.2);moving(farm,tree,-i*15);}
  const barn=new THREE.Group();barn.position.x=-12;mesh(barn,'box',0xb35b43,0,2,0,5,4,7);mesh(barn,'cone',0x714537,0,4.5,0,4,2,5).rotation.y=Math.PI/4;mesh(barn,'box',0xf3d9b0,0,1.5,3.52,1.7,3,.06);moving(farm,barn,-30);
  const city=world('city');mesh(city,'box',0x485e65,0,-.25,-60,220,.4,230);mesh(city,'box',0x293c46,0,-.03,-60,6,.04,230);
  for(let i=0;i<22;i++){const g=new THREE.Group(),h=3+(i*7%11);g.position.x=(i%2?1:-1)*(6+i%3*2);mesh(g,'box',[0x66858b,0x77928c,0x596e7c,0xc3ae86][i%4],0,h/2,0,3,h,5);for(let w=0;w<3;w++)mesh(g,'box',0xe8d897,(w-1)*.8,h*.65,2.51,.4,.65,.03,true);moving(city,g,8-i*6);}
  for(let i=0;i<10;i++){const g=new THREE.Group();g.position.x=i%2?3.6:-3.6;mesh(g,'cylinder',0x37484e,0,2,0,.06,4,.06);mesh(g,'box',0x35474a,-.4,3.85,0,.85,.1,.1);mesh(g,'box',0xedf1bc,-.8,3.77,0,.3,.08,.25,true);if(i%3===0){mesh(g,'box',0x192c30,0,2.7,0,.25,.75,.25);mesh(g,'sphere',0xcff76b,0,2.5,.14,.075,.075,.04,true);}moving(city,g,-i*13);}
  for(let i=0;i<20;i++){const line=mesh(city,'box',0xe4dac0,0,.005,-i*7,.12,.02,2);movers.push({object:line,world:city,origin:-i*7});}
  const sky=world('sky');for(let i=0;i<22;i++){const g=new THREE.Group();g.position.set((i%2?1:-1)*(6+i%5*2),-2+(i%4)*2,0);for(let j=0;j<3;j++)mesh(g,'sphere',0xf2f3e4,j*1.9,0,0,2,1.1,1.4);moving(sky,g,8-i*7);}
  const orbit=world('orbit'),earth=mesh(orbit,'sphere',0x407fbd,-7,-44,-65,42,42,42);for(let i=0;i<15;i++){const a=i*2.4,b=.3+(i%5)*.18;mesh(earth,'sphere',0x83ac79,Math.cos(a)*Math.sin(b),Math.cos(b),Math.sin(a)*Math.sin(b),.18,.035,.13);}
  const atmosphere=new THREE.Mesh(new THREE.SphereGeometry(43,28,18),new THREE.MeshBasicMaterial({color:0x78c9e8,wireframe:true,transparent:true,opacity:.09}));atmosphere.position.copy(earth.position);orbit.add(atmosphere);
  const solar=world('solar');const sunSphere=mesh(solar,'sphere',0xffda8c,-23,6,-90,16,16,16,true);
  for(let i=0;i<8;i++){const planet=new THREE.Group();planet.position.set((i%2?1:-1)*(7+i*2),-3+i%3*3,0);const size=.8+(i%3)*.9;mesh(planet,'sphere',[0xd69b6b,0x6ba5ac,0xb9b086,0xae86ab][i%4],0,0,0,size,size,size);if(i===5){const ring=new THREE.Mesh(new THREE.TorusGeometry(size*1.65,.12,5,32),material(0xd6c397));ring.rotation.x=1.1;planet.add(ring);}moving(solar,planet,-15-i*15);}
  world('interstellar');
  const starPositions=new Float32Array(180*6),starBase=[];for(let i=0;i<180;i++){const angle=i*2.39996,radius=8+(i*17%44);starBase.push([Math.cos(angle)*radius,Math.sin(angle)*radius,8-(i*13%170)]);}
  const starGeometry=new THREE.BufferGeometry();starGeometry.setAttribute('position',new THREE.BufferAttribute(starPositions,3));const stars=new THREE.LineSegments(starGeometry,new THREE.LineBasicMaterial({color:0xc7e4f1,transparent:true,opacity:.75}));stars.frustumCulled=false;scene.add(stars);
  const palette={farm:[0xa5c5b8,0x799967],city:[0xa1b5bb,0x718186],sky:[0x6b9ebb,0x4c7199],orbit:[0x101e3c,0x446079],solar:[0x101627,0x565277],interstellar:[0x080e20,0x517480]};
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');let worldId='',clock=0;
  function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.fov=49;camera.updateProjectionMatrix();}
  const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
  function draw(speed,dt,playing,mouth){
    const current=worldAt(speed),level=Math.min(1,Math.log10(1+speed)/9),ratio=speed/LIGHT_SPEED;clock+=dt;
    if(current.id!==worldId){worldId=current.id;for(const [id,g] of Object.entries(worlds))g.visible=id===worldId;scene.background=new THREE.Color(palette[worldId][0]);scene.fog=new THREE.Fog(palette[worldId][0],45,165);hemi.groundColor.setHex(palette[worldId][1]);}
    if(worldId==='sky'){const darken=Math.min(1,(speed-1000)/9000);scene.background.setHex(0x6b9ebb).lerp(new THREE.Color(0x172c53),darken);scene.fog.color.copy(scene.background);}
    const motion=reduced.matches?.18:1,flow=playing?(2+level*45)*motion:1;
    for(const m of movers)if(m.world.visible){m.object.position.z+=dt*flow;if(m.object.position.z>20)m.object.position.z-=160;}
    const running=playing&&speed>.01,pace=running?Math.min(24,5+level*22):0;for(let i=0;i<paws.length;i++)paws[i].rotation.x=Math.sin(clock*pace+(i===0||i===3?0:Math.PI))*.8*motion;
    body.scale.z=.85+level*.65;chest.position.z=-.52-level*.25;head.position.z=-.82-level*.42;head.rotation.y=-.8;head.rotation.x=level*.2;cat.position.y=.55+(running?Math.abs(Math.sin(clock*pace))*.08*motion:0);cat.scale.z=1+level*.35;tail.rotation.x=-.65+level*.55;tail.rotation.z=Math.sin(clock*5)*.12*motion;
    const light=catLightAppearance(level,ratio),white=new THREE.Color(0xffffff);
    for(const [material,baseColor] of coatMaterials){material.color.copy(baseColor);if(![0x203b32,0x745348].includes(baseColor.getHex()))material.color.lerp(white,light.whiten);material.emissive.setHex(0xf4ba76);material.emissiveIntensity=catEmissiveIntensity(level);}
    halo.position.set(cat.position.x,cat.position.y+.65,cat.position.z);halo.scale.setScalar(light.haloScale);haloMaterial.opacity=light.haloOpacity;halo.visible=haloMaterial.opacity>0;
    trails.visible=level>.25;for(const piece of trails.children)piece.scale.set(.10+level*.06,.10+level*.06,1+level*7+ratio*6);
    stars.visible=['orbit','solar','interstellar'].includes(worldId);if(stars.visible){for(let i=0;i<starBase.length;i++){const [x,y,z]=starBase[i],movingZ=((z+clock*(worldId==='interstellar'?55:8)*motion+180)%180)-160,length=worldId==='interstellar'?(reduced.matches?1:4+level*20):.07;starPositions.set([x,y,movingZ,x,y,movingZ+length],i*6);}starGeometry.attributes.position.needsUpdate=true;}
    earth.rotation.y+=dt*.012;sunSphere.rotation.y+=dt*.01;head.scale.y=mouth?1.08:1;renderer.render(scene,camera);
  }
  // Project only the cat, excluding its trail and halo, into canvas-relative coordinates.
  function catScreen(){
    cat.updateWorldMatrix(true,true);camera.updateMatrixWorld();
    const box=new THREE.Box3(),point=new THREE.Vector3();cat.traverse(part=>{if(part.isMesh&&!trails.children.includes(part))box.expandByObject(part);});
    let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
    for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
      point.set(x,y,z).project(camera);const px=(point.x+1)/2,py=(1-point.y)/2;
      left=Math.min(left,px);right=Math.max(right,px);top=Math.min(top,py);bottom=Math.max(bottom,py);
    }
    return {x:(left+right)/2,y:(top+bottom)/2,w:right-left,h:bottom-top};
  }
  return {draw,resize,catScreen,stats:()=>({calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,pixelRatio:renderer.getPixelRatio()}),dispose(){observer.disconnect();renderer.dispose();haloGeometry.dispose();haloMaterial.dispose();for(const piece of trails.children){piece.geometry.dispose();piece.material.dispose();}for(const g of Object.values(geometries))g.dispose();for(const m of materials.values())m.dispose();}};
}

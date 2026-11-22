import * as THREE from '../vendor/three.js';

export function makeBasicMaterials(species = {}) {
  const colors = species.look?.colors ?? {};
  const fleshColor = { white: '#f5e3d3', pink: '#f0c6bb', red: '#ad5954' }[species.look?.flesh] ?? '#f0c6bb';
  function standard(name, color, roughness, metalness = 0, extras = {}) {
    return new THREE.MeshStandardMaterial({ name, color, roughness, metalness, ...extras });
  }
  const skin = standard('皮', colors.flank ?? '#B8C7CC', 0.37, 0.28, { side: THREE.DoubleSide, vertexColors: true });
  // 表は体側の色を基準にした頂点色、剥いだ裏はパールがかった薄い灰桃色です。
  skin.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>',
      '#include <color_fragment>\nif (!gl_FrontFacing) diffuseColor.rgb = vec3(0.70, 0.58, 0.54);');
  };
  return {
    skin, flesh: standard('身', fleshColor, 0.52), cap: standard('切り口', fleshColor, 0.61),
    bone: standard('骨', '#eae1c5', 0.57), organ: standard('腸', '#cd8981', 0.40),
    fin: standard('ヒレの膜', colors.fin ?? '#A5A882', 0.52, 0.07, {vertexColors: !!species.look?.blindSide}),
    ray: standard('ヒレのすじ', '#858568', 0.51),
    iris: standard('虹彩', colors.iris ?? '#D8D6C8', 0.29, 0.22), eye: standard('瞳孔', '#101c23', 0.16),
    glint: standard('目の光', '#f5f8f5', 0.15), dark: standard('口と鰓の縁', '#39454a', 0.57),
    stomach: standard('胃', '#e4b7a8', 0.43), liver: standard('肝臓', '#9f5854', 0.39),
    bladder: standard('鰾', '#cbd7d8', 0.30, 0.28), kidney: standard('背わた', '#793e48', 0.48),
  };
}

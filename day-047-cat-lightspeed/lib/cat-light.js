// 光の猫：光速比90%で縁が白青に光り（glow）、99%から毛色が白へ寄り、99.9%で8割以上が白（light）。
// 変化量 amount は光速との差の桁 d=−log10(1−v/c) で決める：d=1(90%)→0、2(99%)→0.3、3(99.9%)→0.8、5(99.999%)→1。
export const GLOW_RATIO=.9, LIGHT_RATIO=.999;
const unit=value=>Number.isNaN(value)?0:Math.max(0,Math.min(1,value));
export function lightPhase(ratio){return ratio>=LIGHT_RATIO?'light':ratio>=GLOW_RATIO?'glow':'coat';}
export function lightAmount(ratio){
  const r=unit(ratio);if(r<GLOW_RATIO)return 0;
  const d=-Math.log10(Math.max(1e-9,1-r));
  return d<2?.3*(d-1):d<3?.3+.5*(d-2):Math.min(1,.8+.2*(d-3)/2);
}
export const CAT_EMISSIVE_MAX=.55;
// level（旧API）は速度の桁の目安。光の見た目は ratio だけで決め、低速では毛色を保つ。
export function catEmissiveIntensity(level,ratio=0){return CAT_EMISSIVE_MAX*lightAmount(ratio);}
export const CAT_WHITEN_MAX=1, CAT_HALO_OPACITY_MAX=0, CAT_HALO_SCALE_MAX=1;
export function catLightAppearance(level,ratio){
  const amount=lightAmount(ratio),phase=lightPhase(ratio);
  // rim：縁の光。glow の入り口から立ち上げ、light で最大。whiten：毛色を白へ寄せる割合。
  return {phase,amount,rim:unit(amount/.3)*.9+.1*unit((amount-.8)/.2),whiten:unit((amount-.3)/.5)*.8+.2*unit((amount-.8)/.2),glow:amount,haloOpacity:0,haloScale:1};
}

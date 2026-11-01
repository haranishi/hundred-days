// OWNER: world-art
// 灯りの減衰を、ゲームの明るさの計算（docs/RULES.md）と同じ曲線にする。
// three の点光源は 1/距離^decay に窓を掛けるが、それでは光だまりがゲームの radius よりずっと小さく見える。
// decay を負（印）にした点光源だけ、f(u) = max(0, 1−u²)²（u ＝ 距離 ÷ distance）に差し替える。
// 人物の材質も同じ灯りで照らされるので、全体の ShaderChunk を書き換える（材質のコンパイルより前に呼ぶこと）。
// あわせて、点光源の繰り返しで「届かない灯り」（色が 0）の BRDF の計算を飛ばす。three は visible を求めるが使っていない。
// 灯りは 25（ステージ 13・手提灯 9・炎上 3）あり、ほとんどの画素ではほとんどの灯りが届かないので、ここが一番効く。
import { ShaderChunk } from 'three';

/** 点光源の decay にこの値を入れると、ゲームと同じ曲線になる。 */
export const GAME_CURVE_DECAY = -1;

const TARGET = 'float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );';
const REPLACEMENT = `if ( decayExponent < 0.0 ) {
		// 影討ち：ゲームの明るさと同じ曲線 (1 - u^2)^2
		float kgU = lightDistance / max( cutoffDistance, 1e-3 );
		return pow2( saturate( 1.0 - kgU * kgU ) );
	}
	${TARGET}`;

const POINT_INFO = 'getPointLightInfo( pointLight, geometryPosition, directLight );';
const RE_DIRECT = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';

let installed = false;

export function installGameLightCurve(): void {
  if (installed) return;
  const src = ShaderChunk.lights_pars_begin;
  if (!src.includes(TARGET)) throw new Error('lightCurve: three の lights_pars_begin が想定と違う（版が変わった可能性）');
  ShaderChunk.lights_pars_begin = src.replace(TARGET, REPLACEMENT);
  const begin = ShaderChunk.lights_fragment_begin;
  const at = begin.indexOf(POINT_INFO);
  const re = at < 0 ? -1 : begin.indexOf(RE_DIRECT, at);
  if (re < 0) throw new Error('lightCurve: three の lights_fragment_begin の点光源の繰り返しが想定と違う');
  ShaderChunk.lights_fragment_begin = begin.slice(0, re) + 'if ( directLight.visible ) ' + begin.slice(re);
  installed = true;
}

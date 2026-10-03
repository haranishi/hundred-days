// OWNER: tests
// CSM の塊を本体に差し込んだ結果に、r186 の多重散乱の準備と CSM の段の処理が両方あること。
// three を上げたときに、ガラスが黒くなる不具合（環境反射が 0）が戻らないようにする。
import { ShaderChunk } from 'three';
import * as CSMShaderModule from 'three/examples/jsm/csm/CSMShader.js';
import { describe, expect, it } from 'vitest';
import { buildCsmLightsBegin } from '../../src/render/csmChunk';

const CSMShader = (CSMShaderModule as unknown as { CSMShader: { lights_fragment_begin: string } }).CSMShader;

describe('CSM と本体の塊の合成', () => {
  const merged = buildCsmLightsBegin(ShaderChunk.lights_fragment_begin, CSMShader.lights_fragment_begin);

  it('本体の多重散乱の準備（material.dfg）を残している', () => {
    expect(ShaderChunk.lights_fragment_begin).toContain('material.dfg =');
    expect(merged).toContain('material.dfg =');
    expect(merged).toContain('material.multiScatteringCompensation');
  });

  it('CSM の段の選択（CSM_cascades）を含み、CSM を使わない材質には本体の平行光源の処理が残る', () => {
    expect(merged).toContain('CSM_cascades');
    expect(merged).toContain('#if defined( USE_CSM ) && defined( CSM_CASCADES )');
    expect(merged.split('#else').length).toBeGreaterThan(1);
  });

  it('examples の CSMShader の写しには多重散乱の準備が無い（この差し替えが要る理由）', () => {
    expect(CSMShader.lights_fragment_begin).not.toContain('material.dfg');
  });

  it('影を受けた後の太陽の入射光を csmSunIn に残す（CSM の3つの版と本体の版のすべてで）', () => {
    expect(merged).toContain('vec3 csmSunIn = vec3( 0.0 );');
    // 宣言は #if の外（どの材質の main にも必ずある）
    expect(merged.indexOf('vec3 csmSunIn')).toBeLessThan(merged.indexOf('#if defined( USE_CSM ) && defined( CSM_CASCADES )'));
    expect(merged).toContain('csmSunIn = mix( csmSunIn, directLight.color, blendRatio );');
    expect((merged.match(/csmSunIn = directLight\.color;/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('#if と #endif の数が釣り合っている', () => {
    const opens = (merged.match(/#if/g) ?? []).length;
    const ends = (merged.match(/#endif/g) ?? []).length;
    expect(opens).toBe(ends);
  });
});

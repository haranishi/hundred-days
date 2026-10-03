// OWNER: world
// 建物の見た目を決める：外壁の描き方・窓割り・色・屋根・屋上の設備・体積。
// 同じ種類でも variant（色見本・窓割り・屋根の番号）と個体ごとの揺らぎで1棟ずつ変える。
import type { CityConfig } from '../config/city';
import { stream, type Rng } from '../core/rng';
import type { BuildingDraft } from './buildings';
import { hexToRgb, jitterColor, scaleColor, type RGB } from './color';
import { centerX, centerZ, depth, inset, insetAll, width } from './geom';
import type { Building, FacadeSpec, FacadeStyle, Mass, Rect, RoofItem, RoofKind, RoofSpec } from './types';

export interface Variant {
  palette: number;
  facade: number;
  roof: number;
}

export function signatureOf(kind: string, v: Variant): string {
  return `${kind}:${v.palette}:${v.facade}:${v.roof}`;
}

type RoofItemKind = 'penthouse' | 'ac' | 'tank' | 'frame' | 'cooling';

function makeRoofItems(wanted: RoofItemKind[], top: Rect, roofY: number, parapet: number, wall: RGB, rng: Rng): RoofItem[] {
  const inner = insetAll(top, parapet > 0 ? 1.4 : 0.8);
  if (width(inner) < 5 || depth(inner) < 5) return [];
  const items: RoofItem[] = [];
  // 四隅のどこに何を置くかを先に割り振り、重ならないようにする（Fisher–Yates）
  const corners = [0, 1, 2, 3];
  for (let i = corners.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [corners[i], corners[j]] = [corners[j], corners[i]];
  }
  const cornerXZ = (c: number, w: number, d: number): { x: number; z: number } => ({
    x: c % 2 === 0 ? inner.x0 + w / 2 : inner.x1 - w / 2,
    z: c < 2 ? inner.z0 + d / 2 : inner.z1 - d / 2,
  });
  let slot = 0;
  for (const kind of wanted) {
    const corner = corners[slot++ % 4];
    if (kind === 'penthouse') {
      const w = Math.min(width(inner) * 0.42, rng.range(4, 7.5));
      const d = Math.min(depth(inner) * 0.42, rng.range(4, 6.5));
      const p = cornerXZ(corner, w, d);
      items.push({ kind: 'penthouse', x: p.x, z: p.z, y: roofY, w, d, h: rng.range(2.9, 4), color: scaleColor(wall, 0.92) });
    } else if (kind === 'tank') {
      const s = Math.min(width(inner) * 0.3, depth(inner) * 0.3, rng.range(2.2, 3.6));
      const p = cornerXZ(corner, s, s);
      const color = hexToRgb(rng.pick([0xdadfe2, 0xa8b8c0, 0xc9c5bb]));
      items.push({ kind: 'tank', x: p.x, z: p.z, y: roofY + 1.1, w: s, d: s, h: rng.range(2.2, 3.2), color });
    } else if (kind === 'cooling') {
      // 冷却塔：四角い胴と、上の送風機の輪（描く側で形にする）
      const s = Math.min(width(inner) * 0.3, depth(inner) * 0.3, rng.range(3.6, 5.2));
      const p = cornerXZ(corner, s, s);
      items.push({ kind: 'cooling', x: p.x, z: p.z, y: roofY, w: s, d: s, h: rng.range(2.6, 3.6), color: hexToRgb(rng.pick([0xc8ccce, 0xa9b2b6, 0xd4d2cb])) });
    } else if (kind === 'frame') {
      const alongX = width(inner) >= depth(inner);
      const w = Math.min((alongX ? width(inner) : depth(inner)) * 0.7, rng.range(6, 11));
      const p = { x: centerX(inner), z: centerZ(inner) };
      items.push({
        kind: 'frame',
        x: p.x,
        z: p.z,
        y: roofY,
        w: alongX ? w : 0.5,
        d: alongX ? 0.5 : w,
        h: rng.range(3.5, 6),
        color: hexToRgb(0x3d3f42),
      });
    } else {
      // 室外機の列
      const count = rng.int(3, 9);
      const alongX = rng.chance(0.5);
      const unit = { w: 1.4, d: 0.9, h: 1.1 };
      const rowLen = count * (alongX ? unit.w + 0.5 : unit.d + 0.5);
      if (rowLen > (alongX ? width(inner) : depth(inner)) * 0.8) continue;
      const start = cornerXZ(corner, alongX ? rowLen : unit.w, alongX ? unit.d : rowLen);
      for (let i = 0; i < count; i++) {
        const offset = (i + 0.5) * (rowLen / count) - rowLen / 2;
        items.push({
          kind: 'box',
          x: alongX ? start.x + offset : start.x,
          z: alongX ? start.z : start.z + offset,
          y: roofY,
          w: alongX ? unit.w : unit.d,
          d: alongX ? unit.d : unit.w,
          h: unit.h,
          color: jitterColor(0xc9c9c4, rng, 0.5),
        });
      }
    }
  }
  return items;
}

/** 勾配屋根の体積（被害額と破壊率に入れる）。寄棟は中央の三角柱＋両端の四角錐。 */
export function roofVolume(kind: RoofKind, w: number, d: number, pitch: number): number {
  if (kind === 'flat' || pitch <= 0) return 0;
  if (kind === 'hip') {
    const long = Math.max(w, d);
    const short = Math.min(w, d);
    return (short * pitch * (long - short)) / 2 + (short * short * pitch) / 3;
  }
  return (w * d * pitch) / 2;
}

function massVolume(m: Mass): number {
  return width(m.rect) * depth(m.rect) * (m.y1 - m.y0);
}

function facade(
  floorHeight: number,
  bayWidth: number,
  windowWidth: number,
  windowHeight: number,
  groundFloor: number,
  trimColor: RGB,
  glassColor: RGB,
): FacadeSpec {
  return { floorHeight, bayWidth, windowWidth, windowHeight, groundFloor, trimColor, glassColor };
}

interface Look {
  masses: Mass[];
  roof: RoofSpec;
  facade: FacadeSpec;
}

function flatRoof(cfg: CityConfig, rng: Rng, parapet: number, items: RoofItem[]): RoofSpec {
  return {
    kind: 'flat',
    pitchHeight: 0,
    ridgeAxis: 'x',
    parapet,
    overhang: 0,
    color: jitterColor(rng.pick(cfg.palettes.flatRoof), rng, 0.6),
    items,
  };
}

function lookFor(cfg: CityConfig, d: BuildingDraft, v: Variant, rng: Rng): Look {
  const P = cfg.palettes;
  const top = d.masses[d.masses.length - 1];
  const trim = jitterColor(rng.pick(P.trim), rng, 0.5);
  const glass = jitterColor(rng.pick(P.windowGlass), rng, 0.4);
  const withStyle = (style: FacadeStyle, color: RGB) => (m: BuildingDraft['masses'][number]): Mass => ({
    rect: m.rect,
    y0: m.y0,
    y1: m.y1,
    facade: style,
    wallColor: color,
  });

  switch (d.kind) {
    case 'glassTower': {
      const glassTint = jitterColor(P.towerGlass[v.palette], rng, 0.5);
      const stone = jitterColor(rng.pick(P.towerStone), rng, 0.7);
      const metal = hexToRgb(rng.pick([0x8c8e90, 0x3c3e41, 0xb4b6b8]));
      const towerStyle: FacadeStyle = v.facade === 2 ? 'ribbon' : 'curtain';
      const towerWall = v.facade === 2 ? stone : scaleColor(glassTint, 0.85);
      const masses: Mass[] = d.masses.map((m) =>
        m.role === 'podium' ? withStyle('stone', stone)(m) : withStyle(towerStyle, towerWall)(m),
      );
      let parapet = rng.range(1.2, 2);
      const tower = masses[masses.length - 1];
      if (v.roof === 1 && tower.y1 - tower.y0 > 30) {
        // 冠部：最上部の数階を一回り細くする
        const crownH = d.floorHeight * rng.int(2, 4);
        const crown: Mass = { ...tower, rect: insetAll(tower.rect, rng.range(2, 3.5)), y0: tower.y1 - crownH };
        tower.y1 -= crownH;
        masses.push(crown);
      } else if (v.roof === 2) {
        parapet = rng.range(3, 4.5);
      }
      const roofTop = masses[masses.length - 1];
      const bayWidth = v.facade === 2 ? rng.range(1.8, 2.3) : rng.range(1.45, 1.8);
      const windowHeight = v.facade === 0 ? 0.9 : v.facade === 1 ? rng.range(0.58, 0.7) : rng.range(0.45, 0.56);
      // r01-city：塔の屋上に冷却塔を足す（空から見た屋上の設備）。系列の引く回数は冷却塔の分だけ後ろに増える
      const items = makeRoofItems(v.roof === 2 ? ['ac', 'ac', 'cooling'] : ['penthouse', 'cooling', 'ac', 'ac'], roofTop.rect, roofTop.y1, parapet, stone, rng);
      const roof = flatRoof(cfg, rng, parapet, items);
      // 高さ100mを超え、屋上が広い塔には緊急離着陸場の印（日本の高層ビルの屋上の「H」）
      roof.helipad = roofTop.y1 + parapet > 100 && Math.min(width(roofTop.rect), depth(roofTop.rect)) >= 28;
      return {
        masses,
        roof,
        facade: facade(d.floorHeight, bayWidth, 0.93, windowHeight, 5.2, metal, glassTint),
      };
    }
    case 'tileMidrise': {
      const wall = jitterColor(P.tileWall[v.palette], rng);
      const style: FacadeStyle = v.facade === 1 ? 'ribbon' : 'punched';
      const bay = v.facade === 0 ? rng.range(3, 3.8) : v.facade === 1 ? rng.range(1.6, 2) : rng.range(4.4, 5.6);
      const ww = v.facade === 0 ? rng.range(0.46, 0.6) : v.facade === 1 ? 0.86 : rng.range(0.66, 0.76);
      const wh = v.facade === 1 ? rng.range(0.42, 0.5) : rng.range(0.5, 0.6);
      const ground = d.intensity > 0.3 || rng.chance(0.6) ? 4.2 : 0;
      const parapet = rng.range(0.8, 1.3);
      const wanted: RoofItemKind[] = v.roof === 0 ? ['ac', 'ac'] : v.roof === 1 ? ['penthouse', 'ac'] : ['tank', 'ac'];
      return {
        masses: d.masses.map(withStyle(style, wall)),
        roof: flatRoof(cfg, rng, parapet, makeRoofItems(wanted, top.rect, top.y1, parapet, wall, rng)),
        facade: facade(d.floorHeight, bay, ww, wh, ground, trim, glass),
      };
    }
    case 'zakkyo': {
      const wall = jitterColor(P.zakkyoWall[v.palette], rng);
      const style: FacadeStyle = v.facade === 2 ? 'ribbon' : 'punched';
      const bay = v.facade === 0 ? rng.range(2.4, 3) : v.facade === 1 ? rng.range(3.6, 4.8) : rng.range(1.5, 1.9);
      const ww = v.facade === 0 ? rng.range(0.5, 0.62) : v.facade === 1 ? rng.range(0.64, 0.74) : 0.85;
      const wh = v.facade === 2 ? rng.range(0.4, 0.48) : rng.range(0.46, 0.56);
      const parapet = rng.range(0.7, 1.1);
      const wanted: RoofItemKind[] = v.roof === 0 ? ['tank', 'ac'] : v.roof === 1 ? ['frame', 'ac'] : ['ac'];
      return {
        masses: d.masses.map(withStyle(style, wall)),
        roof: flatRoof(cfg, rng, parapet, makeRoofItems(wanted, top.rect, top.y1, parapet, wall, rng)),
        facade: facade(d.floorHeight, bay, ww, wh, 3.8, trim, glass),
      };
    }
    case 'apartment': {
      const wall = jitterColor(P.apartmentWall[v.palette], rng, 0.6);
      const parapet = rng.range(0.9, 1.2);
      const wanted: RoofItemKind[] = v.roof === 0 ? ['tank'] : ['penthouse'];
      return {
        masses: d.masses.map(withStyle('balcony', wall)),
        roof: flatRoof(cfg, rng, parapet, makeRoofItems(wanted, top.rect, top.y1, parapet, wall, rng)),
        facade: facade(d.floorHeight, rng.range(3.4, 4.2), v.facade === 0 ? 0.72 : 0.56, 0.7, rng.chance(0.3) ? 3.2 : 0, trim, glass),
      };
    }
    case 'house': {
      const wall = jitterColor(P.houseWall[v.palette], rng);
      const roofColors = P.houseRoof.length;
      const kind: RoofKind = v.roof < roofColors ? 'gable' : 'hip';
      const bay = v.facade === 0 ? rng.range(2.4, 2.8) : v.facade === 1 ? rng.range(3, 3.6) : rng.range(1.8, 2.2);
      const ww = v.facade === 0 ? 0.42 : v.facade === 1 ? 0.5 : 0.38;
      const wh = v.facade === 0 ? 0.5 : v.facade === 1 ? 0.55 : 0.45;
      return {
        masses: d.masses.map(withStyle('siding', wall)),
        roof: {
          kind,
          pitchHeight: rng.range(1.8, 3),
          ridgeAxis: width(top.rect) >= depth(top.rect) ? 'x' : 'z',
          parapet: 0,
          overhang: rng.range(0.45, 0.6),
          color: jitterColor(P.houseRoof[v.roof % roofColors], rng, 0.5),
          items: [],
        },
        facade: facade(d.floorHeight, bay, ww, wh, 0, trim, glass),
      };
    }
    case 'warehouse': {
      const wall = jitterColor(P.warehouseWall[v.palette], rng, 0.7);
      const band = v.facade === 1 ? jitterColor(rng.pick(P.trim), rng) : scaleColor(wall, 0.8);
      const shutter = rng.range(4.5, 5.6);
      const fac = facade(d.floorHeight, rng.range(6, 8), 0.5, 0.22, shutter, band, glass);
      if (v.roof === 2) {
        const parapet = 0.8;
        return {
          masses: d.masses.map(withStyle('corrugated', wall)),
          roof: flatRoof(cfg, rng, parapet, makeRoofItems(['ac'], top.rect, top.y1, parapet, wall, rng)),
          facade: fac,
        };
      }
      return {
        masses: d.masses.map(withStyle('corrugated', wall)),
        roof: {
          kind: v.roof === 0 ? 'gable' : 'sawtooth',
          pitchHeight: v.roof === 0 ? rng.range(1.5, 3) : rng.range(2.5, 3.5),
          ridgeAxis: width(top.rect) >= depth(top.rect) ? 'x' : 'z',
          parapet: 0,
          overhang: 0.3,
          color: jitterColor(rng.pick([0x7d8589, 0x9b9e9d, 0x6d5b50, 0x566b74]), rng, 0.5),
          items: [],
        },
        facade: fac,
      };
    }
  }
}

/** 形と見た目の選択から、完成した建物のデータを作る。系列は city.look（建物 id ごと）。 */
export function materialize(cfg: CityConfig, id: number, draft: BuildingDraft, variant: Variant): Building {
  const rng = stream(cfg.seed, 'city.look', draft.lotId);
  const look = lookFor(cfg, draft, variant, rng);
  const top = look.masses.reduce((a, m) => (m.y1 > a.y1 ? m : a), look.masses[0]);
  const pitched = look.roof.kind !== 'flat';
  const height = top.y1 + (pitched ? look.roof.pitchHeight : look.roof.parapet);
  let volume = look.masses.reduce((sum, m) => sum + massVolume(m), 0);
  if (pitched) volume += roofVolume(look.roof.kind, width(top.rect), depth(top.rect), look.roof.pitchHeight);
  // 基壇がある場合でも外形は敷地に対する全塊の外接矩形
  const footprint = look.masses.reduce(
    (acc, m) => ({
      x0: Math.min(acc.x0, m.rect.x0),
      z0: Math.min(acc.z0, m.rect.z0),
      x1: Math.max(acc.x1, m.rect.x1),
      z1: Math.max(acc.z1, m.rect.z1),
    }),
    inset(look.masses[0].rect, 0, 0, 0, 0),
  );
  return {
    id,
    lotId: draft.lotId,
    blockId: draft.blockId,
    kind: draft.kind,
    footprint,
    height,
    floors: draft.floors,
    masses: look.masses,
    roof: look.roof,
    facade: look.facade,
    volume,
    seed: rng.next(),
    variant: { ...variant },
    signature: signatureOf(draft.kind, variant),
  };
}

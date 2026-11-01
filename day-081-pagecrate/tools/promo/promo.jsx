import React from 'react';
import {AbsoluteFill, Img, cancelRender, continueRender, delayRender, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {CAPTURE_FRAMES, CLIPS, END_CARD, FOOTAGE, TAG, TOTAL_FRAMES, clipAt} from './timeline.mjs';

// 書体：Zen Kaku Gothic New（SIL OFL 1.1）。render.mjs が output/public へ写す
const fontReady = delayRender('Zen Kaku Gothic New');
if (typeof document !== 'undefined') {
  Promise.all([['zen-bold.ttf', '700'], ['zen-medium.ttf', '500']].map(([file, weight]) => new FontFace('PromoFont', `url(${staticFile(file)})`, {weight}).load()))
    .then((faces) => { faces.forEach((face) => document.fonts.add(face)); continueRender(fontReady); })
    .catch((error) => cancelRender(error));   // 書体が無いまま別の書体で描かない
}

// PageCrate の配色（globals.css の --ink・--paper・--teal）を、暗い額縁に合わせて明るくしたもの
const C = {ink: '#17201d', paper: '#f7f7f0', muted: '#a3ada7', teal: '#17675e', tealLight: '#8fd1c4', warm: '#e6a57c', line: '#8fd1c455'};
const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'};
const TAP_TYPES = new Set(['press-demo', 'filter-tap', 'search-tap', 'select', 'save']);
const TAP_FRAMES = 20;

/** 押した要素の、そのコマでの中心。押した後は撮影時に追った位置（画面が組み変わっても要素に付いていく） */
function tapPoint(tap, frame) {
  const tracked = (tap.track ?? []).filter(([at]) => at <= frame).at(-1);
  return tracked && frame >= tap.frame ? {x: tracked[1], y: tracked[2]} : {x: tap.x, y: tap.y};
}

/** 触れた印：指の位置の点と、広がって消える輪。座標は撮影画像のピクセル */
function TapMarks({frame, taps}) {
  return taps.filter((tap) => TAP_TYPES.has(tap.type) && frame >= tap.frame - 3 && frame < tap.frame + TAP_FRAMES).map((tap) => {
    const {x, y} = tapPoint(tap, frame);
    const t = (frame - tap.frame) / TAP_FRAMES;
    const press = interpolate(frame, [tap.frame - 3, tap.frame, tap.frame + 6, tap.frame + 10], [0, 1, 1, 0], clamp);
    const ring = interpolate(t, [0, 1], [26, 92], clamp);
    const ringAlpha = interpolate(t, [0, 0.15, 1], [0, 0.95, 0], clamp);
    return <React.Fragment key={`${tap.type}-${tap.frame}`}>
      <div style={{position: 'absolute', left: x - 22, top: FOOTAGE.top + y - 22, width: 44, height: 44, borderRadius: 22, background: '#ffffffb3', border: `4px solid ${C.teal}`, boxSizing: 'border-box', opacity: press, transform: `scale(${0.8 + 0.2 * press})`}}/>
      {frame >= tap.frame && <div style={{position: 'absolute', left: x - ring, top: FOOTAGE.top + y - ring, width: ring * 2, height: ring * 2, borderRadius: ring, border: '5px solid #ffffff', boxShadow: `0 0 0 3px ${C.teal}cc, inset 0 0 0 3px ${C.teal}88`, opacity: ringAlpha, boxSizing: 'border-box'}}/>}
    </React.Fragment>;
  });
}

function EndCard({local}) {
  const rise = (start) => ({opacity: interpolate(local, [start, start + 10], [0, 1], clamp), transform: `translateY(${interpolate(local, [start, start + 12], [22, 0], clamp)}px)`});
  return <>
    <div style={{position: 'absolute', top: 470, left: 40, right: 40, textAlign: 'center', fontSize: 132, fontWeight: 700, letterSpacing: 1, color: C.paper, ...rise(4)}}>{END_CARD.title}</div>
    <div style={{position: 'absolute', top: 680, left: 40, right: 40, textAlign: 'center', fontSize: 46, fontWeight: 700, color: C.tealLight, ...rise(12)}}>{END_CARD.sub}</div>
    <div style={{position: 'absolute', top: 820, left: 150, right: 150, padding: '30px 0', textAlign: 'center', fontSize: 44, fontWeight: 700, color: '#ffffff', background: C.teal, border: `3px solid ${C.tealLight}`, borderRadius: 18, ...rise(20)}}>{END_CARD.button}</div>
    {END_CARD.notes.map((lines, index) => <div key={lines[0]} style={{position: 'absolute', top: 1060 + index * 150, left: 40, right: 40, textAlign: 'center', fontSize: 31, fontWeight: 500, lineHeight: 1.6, color: '#d5ddd8', ...rise(32 + index * 8)}}>{lines.map((line) => <div key={line} style={{whiteSpace: 'nowrap'}}>{line}</div>)}</div>)}
    <div style={{position: 'absolute', top: 1722, left: 40, right: 40, textAlign: 'center', fontSize: 44, fontWeight: 700, color: C.warm, ...rise(48)}}>{END_CARD.last}</div>
  </>;
}

export function Promo({taps = []}) {
  const frame = useCurrentFrame();
  const clip = clipAt(frame);
  const local = frame - clip.from;
  const end = clip.id === 'outro';
  const shot = Math.min(CAPTURE_FRAMES - 1, frame);
  const enter = clip.id === 'hook' ? 0 : interpolate(local, [0, 12], [24, 0], clamp);
  const chapterIndex = CLIPS.indexOf(clip);
  return <AbsoluteFill style={{background: C.ink, color: C.paper, fontFamily: 'PromoFont, sans-serif', overflow: 'hidden'}}>
    <div style={{position: 'absolute', left: 48, top: 56, right: 48, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', fontWeight: 700}}>
      <span style={{fontSize: 34, letterSpacing: 2}}>DAY 81 <span style={{color: C.muted}}>/ 100</span></span>
      <span style={{fontSize: 30, color: C.tealLight, letterSpacing: 1}}>PageCrate</span>
    </div>
    <div style={{position: 'absolute', top: 124, left: 48, right: 48, height: 4, background: '#ffffff22'}}><div style={{width: `${frame / (TOTAL_FRAMES - 1) * 100}%`, height: 4, background: C.tealLight}}/></div>
    <div style={{position: 'absolute', top: 156, left: 48, fontSize: 30, fontWeight: 700, letterSpacing: 4, color: C.warm}}>{clip.chapter}</div>
    <div style={{position: 'absolute', top: FOOTAGE.top, left: 0, width: FOOTAGE.width, height: FOOTAGE.height, overflow: 'hidden', borderTop: `3px solid ${C.line}`, borderBottom: `3px solid ${C.line}`, boxSizing: 'border-box'}}>
      {/* 終わりの案内：最後のコマをぼかして暗くする（下の画面の文字が案内の文字と重なって読めなくならないように） */}
      <Img src={staticFile(`footage/${String(shot).padStart(4, '0')}.jpg`)} style={{width: FOOTAGE.width, height: FOOTAGE.height, display: 'block', transform: end ? `scale(${interpolate(local, [0, clip.length], [1.04, 1.08], clamp)})` : undefined, filter: end ? `blur(${interpolate(local, [0, 12], [0, 14], clamp)}px)` : undefined}}/>
      {end && <AbsoluteFill style={{background: `linear-gradient(180deg, ${C.ink}e6, ${C.ink}f0 40%, ${C.ink}f5)`, opacity: interpolate(local, [0, 8], [0.75, 1], clamp)}}/>}
      {!end && <div style={{position: 'absolute', top: 10, right: 14, padding: '3px 16px', borderRadius: 999, background: '#17201dd9', border: '1px solid #ffffff40', color: C.paper, fontSize: 25, lineHeight: 1.3, fontWeight: 700}}>{TAG}</div>}
    </div>
    {!end && <TapMarks frame={frame} taps={taps}/>}
    {!end && <div style={{position: 'absolute', top: 1702, left: 48, right: 48, transform: `translateY(${enter}px)`, fontSize: 57, fontWeight: 700, lineHeight: 1.38, letterSpacing: 1}}>
      {clip.lines.map((text, index) => <div key={text} style={{color: index === 1 ? C.tealLight : C.paper, whiteSpace: 'nowrap'}}>{text}</div>)}
    </div>}
    {end && <EndCard local={local}/>}
    <div style={{position: 'absolute', left: 48, right: 48, bottom: 24, display: 'flex', gap: 10}}>{CLIPS.slice(0, 5).map((item, index) => <div key={item.id} style={{flex: 1, height: 6, borderRadius: 3, background: index === chapterIndex ? C.tealLight : index < chapterIndex || end ? '#8fd1c466' : '#ffffff1f'}}/>)}</div>
  </AbsoluteFill>;
}

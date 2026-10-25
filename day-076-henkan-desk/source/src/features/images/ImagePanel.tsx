import { useEffect, useRef, useState } from 'react';
import type { ImageOptions, ToolPanelProps } from '../../shared/contracts';
import { toConversionError } from '../../shared/errors';
import { LIMITS } from '../../shared/limits';
import { inspectImage } from './headers';
import { ASPECT_PRESETS, computePlan, DEFAULT_IMAGE_OPTIONS, validateOptions } from './options';
import { convertImages } from './convert';
import { Icon } from '../../app/Icon';

export function ImagePanel({ sources, startRun, busy, onOptionsChange }: ToolPanelProps & { onOptionsChange?: () => void }) {
  const [options, setOptions] = useState<ImageOptions>(DEFAULT_IMAGE_OPTIONS);
  const [preset, setPreset] = useState('original');
  const [dimensions, setDimensions] = useState<{ width: number; height: number; format: string } | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [previewReady, setPreviewReady] = useState(0);
  const bitmap = useRef<ImageBitmap | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const first = sources[0];
  function update(patch: Partial<ImageOptions>) { setOptions(previous => ({ ...previous, ...patch })); onOptionsChange?.(); }
  useEffect(() => {
    let discarded = false; bitmap.current?.close(); bitmap.current = null;
    setDimensions(null); setPreviewError('');
    if (first) void inspectImage(first.file).then(async header => {
      if (discarded) return;
      const decoded = await createImageBitmap(first.file, { imageOrientation: 'from-image' });
      if (discarded) { decoded.close(); return; }
      bitmap.current = decoded; setDimensions({ width: header.displayWidth, height: header.displayHeight, format: header.format }); setPreviewReady(value => value + 1);
    }).catch(error => { if (!discarded) setPreviewError(toConversionError(error).message); });
    return () => { discarded = true; bitmap.current?.close(); bitmap.current = null; };
  }, [first]);
  let invalid = '';
  let geometryError = '';
  let plan: ReturnType<typeof computePlan> | null = null;
  try { validateOptions(options); } catch (error) { invalid = toConversionError(error).message; }
  if (!invalid && dimensions) {
    try { plan = computePlan(dimensions.width, dimensions.height, options); }
    catch (error) { geometryError = toConversionError(error).message; if (sources.length === 1) invalid = geometryError; }
  }
  if (sources.length > LIMITS.imageCount || sources.reduce((total, source) => total + source.file.size, 0) > LIMITS.imageBatchBytes) invalid = '画像は10枚、合計30MB以内で選んでください。';
  useEffect(() => {
    if (!canvas.current || !bitmap.current || !dimensions) return;
    try {
      const next = computePlan(dimensions.width, dimensions.height, options);
      const scale = Math.min(1, 1000 / next.width, 600 / next.height);
      const target = canvas.current; target.width = Math.max(1, Math.round(next.width * scale)); target.height = Math.max(1, Math.round(next.height * scale));
      const context = target.getContext('2d'); if (!context) return;
      if (options.format === 'jpeg' || options.aspect.mode === 'pad' && options.padFill === 'color') { context.fillStyle = options.background; context.fillRect(0, 0, target.width, target.height); }
      const a = next.source, b = next.destination;
      context.drawImage(bitmap.current, a.x, a.y, a.width, a.height, b.x * scale, b.y * scale, b.width * scale, b.height * scale);
    } catch { /* The form displays the geometry validation error. */ }
  }, [options, dimensions, previewReady]);
  function selectPreset(label: string) {
    setPreset(label);
    if (label === 'original') update({ aspect: { mode: 'original' } });
    else { const selected = ASPECT_PRESETS.find(item => item.label === label); update({ aspect: { mode: options.aspect.mode === 'pad' ? 'pad' : 'crop', width: selected?.width ?? 1, height: selected?.height ?? 1, anchor: { x: 0.5, y: 0.5 } } }); }
  }
  const aspect = options.aspect;
  const changeRatio = (axis: 'width' | 'height', value: string) => { if (aspect.mode !== 'original') update({ aspect: { ...aspect, [axis]: Number(value) } }); };
  return <><div className="section-heading"><h2><span className="step">02</span>変換の設定</h2><span className="subtle">画像</span></div>
    <fieldset disabled={busy} className="settings-fields">
      <div className="field-group"><span className="field-label" id="format-label">出力形式</span><div className="format-picker" role="group" aria-labelledby="format-label">{(['jpeg','png','webp'] as const).map(format => <button key={format} type="button" aria-pressed={options.format === format} className={options.format === format ? 'selected' : ''} onClick={() => update({ format })}><span>{format === 'jpeg' ? 'JPG' : format === 'png' ? 'PNG' : 'WebP'}</span><small>{format === 'jpeg' ? '写真に' : format === 'png' ? 'くっきり・透過' : 'Webに'}</small>{options.format === format && <Icon name="check" size={15}/>}</button>)}</div></div>
      <div className="field-group"><div className="field-label-row"><span className="field-label" id="ratio-label">画像の比率</span><span className="optional">自由な比率もOK</span></div><div className="ratio-picker" role="group" aria-labelledby="ratio-label">{['original', ...ASPECT_PRESETS.map(item => item.label), 'custom'].map(label => <button key={label} type="button" aria-pressed={preset === label} className={preset === label ? 'selected' : ''} onClick={() => selectPreset(label)}>{label === 'original' ? '元の比率' : label === 'custom' ? '自由入力' : label}</button>)}</div>
      {preset === 'custom' && aspect.mode !== 'original' && <div className="custom-ratio"><label>比率の幅<input aria-label="自由比率の幅" type="number" min="1" max="10000" step="1" value={aspect.width || ''} onChange={event => changeRatio('width', event.target.value)}/></label><span>:</span><label>比率の高さ<input aria-label="自由比率の高さ" type="number" min="1" max="10000" step="1" value={aspect.height || ''} onChange={event => changeRatio('height', event.target.value)}/></label></div>}
      {aspect.mode !== 'original' && <div className="aspect-controls"><div className="segmented"><button type="button" aria-pressed={aspect.mode === 'crop'} className={aspect.mode === 'crop' ? 'selected' : ''} onClick={() => update({ aspect: { ...aspect, mode: 'crop' } })}>切り抜く</button><button type="button" aria-pressed={aspect.mode === 'pad'} className={aspect.mode === 'pad' ? 'selected' : ''} onClick={() => update({ aspect: { ...aspect, mode: 'pad' } })}>余白を足す</button></div><p className="field-hint">{aspect.mode === 'crop' ? '枠に収まる部分を切り抜きます。' : '画像全体を残して、周りに余白を足します。'}</p><div className="anchor-controls"><label>左右の位置 <input aria-label="左右の位置" type="range" min="0" max="100" value={Math.round(aspect.anchor.x * 100)} onChange={event => update({ aspect: { ...aspect, anchor: { ...aspect.anchor, x: Number(event.target.value) / 100 } } })}/></label><label>上下の位置 <input aria-label="上下の位置" type="range" min="0" max="100" value={Math.round(aspect.anchor.y * 100)} onChange={event => update({ aspect: { ...aspect, anchor: { ...aspect.anchor, y: Number(event.target.value) / 100 } } })}/></label></div></div>}</div>
      <div className="field-group"><label className="field-label" htmlFor="resize-mode">画像のサイズ</label><select id="resize-mode" value={options.resize.mode} onChange={event => update({ resize: event.target.value === 'percentage' ? { mode: 'percentage', percent: 50 } : event.target.value === 'fit' ? { mode: 'fit', maxWidth: 1920, maxHeight: 1080 } : { mode: 'original' } })}><option value="original">元のサイズを基準にする</option><option value="percentage">割合で小さくする</option><option value="fit">指定したサイズ内に収める</option></select>
      {options.resize.mode === 'percentage' && <div className="number-unit"><input aria-label="サイズの割合" type="number" min="1" max="100" value={options.resize.percent || ''} onChange={event => update({ resize: { mode: 'percentage', percent: Number(event.target.value) } })}/><span>%</span></div>}
      {options.resize.mode === 'fit' && <div className="dimension-inputs"><label>最大幅<input aria-label="最大幅" type="number" min="1" max="8192" value={options.resize.maxWidth || ''} onChange={event => update({ resize: { mode: 'fit', maxWidth: Number(event.target.value), maxHeight: options.resize.mode === 'fit' ? options.resize.maxHeight : 1080 } })}/></label><span>×</span><label>最大高さ<input aria-label="最大高さ" type="number" min="1" max="8192" value={options.resize.maxHeight || ''} onChange={event => update({ resize: { mode: 'fit', maxWidth: options.resize.mode === 'fit' ? options.resize.maxWidth : 1920, maxHeight: Number(event.target.value) } })}/></label><span>px</span></div>}<p className="field-hint">画像を引き伸ばさず、小さく整えます。</p></div>
      {options.format !== 'png' && <div className="field-group"><label className="field-label-row" htmlFor="quality"><span className="field-label">画質</span><strong className="quality-value">{Math.round(options.quality * 100)}<small>%</small></strong></label><input id="quality" type="range" min="10" max="100" value={Math.round(options.quality * 100)} onChange={event => update({ quality: Number(event.target.value) / 100 })}/><div className="range-labels"><span>容量を小さく</span><span>きれいに</span></div></div>}
      {(options.format === 'jpeg' || aspect.mode === 'pad') && <div className="field-group background-setting"><label className="field-label" htmlFor="background">{options.format === 'jpeg' ? '透明部分・余白の背景' : '余白の背景'}</label><div>{aspect.mode === 'pad' && options.format !== 'jpeg' && <label className="checkbox-label"><input type="checkbox" checked={options.padFill === 'transparent'} onChange={event => update({ padFill: event.target.checked ? 'transparent' : 'color' })}/>透明にする</label>}<label className="color-control"><input id="background" type="color" value={options.background} onChange={event => update({ background: event.target.value })}/><span>{options.background.toUpperCase()}</span></label></div></div>}
    </fieldset>
    {first && <div className="preview-area"><div className="preview-label"><span>仕上がりプレビュー{sources.length > 1 ? '（先頭の画像）' : ''}</span>{plan && <strong>{plan.width} × {plan.height} px</strong>}</div><p className="source-dimensions">{dimensions ? `元の画像：${dimensions.format.toUpperCase()} / ${dimensions.width} × ${dimensions.height} px` : ''}</p><div className={`preview-checker ${invalid || previewError || geometryError ? 'preview-invalid' : ''}`}>{!previewError && dimensions ? <canvas ref={canvas} aria-label="比率とサイズ変更後のプレビュー"/> : <p>{previewError || '画像を確認しています…'}</p>}</div></div>}
    {geometryError && sources.length > 1 && <p className="notice">先頭の画像はこの比率にできません。ほかの画像は変換できます。</p>}
    {invalid && <p className="error-text form-error" role="alert">{invalid}</p>}
    <button className="button convert-button" disabled={!sources.length || busy || !!invalid} onClick={() => startRun(context => convertImages(sources, structuredClone(options), context))}><span>{busy ? '変換しています…' : sources.length > 1 ? `${sources.length}枚を変換する` : '変換する'}</span><Icon name="arrow" size={20}/></button>
    <p className="conversion-caption"><Icon name="shield" size={13}/>画像はアップロードされません</p>
  </>;
}

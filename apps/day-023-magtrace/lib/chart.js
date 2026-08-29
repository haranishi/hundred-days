const WIDE_X_LABEL_YEARS = [1997, 2002, 2007, 2012, 2017, 2022, 2026];
const NARROW_X_LABEL_YEARS = [1997, 2007, 2017, 2026];
const chartStates = new WeakMap();

// 集計途中の断りは、線・点線・丸印と重なるプロット内には置かない。
// 最終年のx軸ラベル（y = height - 20）の1行下に、最終点と同じ右端で揃える。
export const PARTIAL_NOTE_TEXT = "集計途中";

export function partialNoteLayout({ width = 760, height = 330, right = 24 } = {}) {
  return { x: width - right, y: height - 6, textAnchor: "end" };
}

export function xLabelYears(width) {
  return width >= 700 ? WIDE_X_LABEL_YEARS : NARROW_X_LABEL_YEARS;
}

const niceCeiling = (value) => {
  if (!Number.isFinite(value) || value <= 0) return 2;
  const scale = 10 ** Math.floor(Math.log10(value));
  const normalized = value / scale;
  const nice = normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * scale;
};

export function yAxisTicks(years) {
  const maximum = Math.max(0, ...years.map(({ count }) => Number.isFinite(count) ? count : 0));
  const top = niceCeiling(maximum);
  return [0, top / 2, top];
}

export function chartCoordinates(years, { width = 760, height = 330, left = 44, right = 24, top = 30, bottom = 48 } = {}) {
  const ticks = yAxisTicks(years);
  const maximum = ticks[ticks.length - 1];
  const innerWidth = width - left - right;
  const innerHeight = height - top - bottom;
  const denominator = Math.max(years.length - 1, 1);
  return years.map((item, index) => ({
    ...item,
    x: left + innerWidth * index / denominator,
    y: Number.isFinite(item.count) ? top + innerHeight * (1 - item.count / maximum) : null,
  }));
}

const svgElement = (name, attributes = {}) => {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
};

function drawChart(container, data, animate) {
  container.replaceChildren();
  const width = container.clientWidth || 760;
  const height = width >= 700 ? 330 : width >= 480 ? 300 : 260;
  const margins = { left: width < 480 ? 40 : 44, right: 24, top: 30, bottom: 48 };
  const points = chartCoordinates(data.years, { width, height, ...margins });
  const ticks = yAxisTicks(data.years);
  const svg = svgElement("svg", { viewBox: `0 0 ${width} ${height}`, width: "100%", role: "img", "aria-label": `「${data.query}」を含む記事タイトルの1997年から2026年までの年別推移` });

  ticks.forEach((tick) => {
    const y = margins.top + (height - margins.top - margins.bottom) * (1 - tick / ticks[ticks.length - 1]);
    svg.append(svgElement("line", { class: "chart-grid", x1: margins.left, x2: width - margins.right, y1: y, y2: y }));
    const label = svgElement("text", { class: "chart-label", x: margins.left - 10, y: y + 4, "text-anchor": "end" });
    label.textContent = String(tick);
    svg.append(label);
  });

  for (const year of xLabelYears(width)) {
    const point = points.find((item) => item.year === year);
    if (!point) continue;
    const label = svgElement("text", { class: "chart-label", x: point.x, y: height - 20, "text-anchor": "middle" });
    label.textContent = String(year);
    svg.append(label);
  }

  const confirmed = points.filter((point) => point.year < data.window.partialYear && point.y !== null);
  if (confirmed.length) {
    const line = svgElement("polyline", { class: `chart-line${animate ? " chart-line--animate" : ""}`, points: confirmed.map((point) => `${point.x},${point.y}`).join(" "), fill: "none" });
    svg.append(line);
  }
  const partial = points.find((point) => point.year === data.window.partialYear);
  const previous = points.find((point) => point.year === data.window.partialYear - 1);
  if (partial?.y !== null && previous?.y !== null) {
    svg.append(svgElement("line", { class: "chart-partial", x1: previous.x, y1: previous.y, x2: partial.x, y2: partial.y }));
    svg.append(svgElement("circle", { class: "chart-partial-dot", cx: partial.x, cy: partial.y, r: 4 }));
    const note = partialNoteLayout({ width, height, right: margins.right });
    const partialLabel = svgElement("text", { class: "chart-partial-label", x: note.x, y: note.y, "text-anchor": note.textAnchor });
    partialLabel.textContent = PARTIAL_NOTE_TEXT;
    svg.append(partialLabel);
  }
  const jump = data.analysis.jump && points.find((point) => point.year === data.analysis.jump.year);
  if (jump?.y !== null) {
    svg.append(svgElement("line", { class: "chart-turn", x1: jump.x, x2: jump.x, y1: margins.top, y2: height - margins.bottom }));
    svg.append(svgElement("circle", { class: "chart-turn-dot", cx: jump.x, cy: jump.y, r: 7 }));
    const anchor = jump.x > width - 60 ? "end" : jump.x < 60 ? "start" : "middle";
    const label = svgElement("text", { class: "chart-turn-label", x: jump.x, y: 18, "text-anchor": anchor });
    label.textContent = `${jump.year}年 転機`;
    svg.append(label);
  }
  container.append(svg);
  return svg;
}

export function renderChart(container, data) {
  let chartState = chartStates.get(container);
  if (!chartState) {
    chartState = { data, frame: 0, lastWidth: 0, rendered: false };
    if (typeof ResizeObserver === "function") {
      chartState.observer = new ResizeObserver(() => {
        const nextWidth = container.clientWidth;
        if (!nextWidth || nextWidth === chartState.lastWidth) return;
        cancelAnimationFrame(chartState.frame);
        chartState.frame = requestAnimationFrame(() => {
          drawChart(container, chartState.data, false);
          chartState.lastWidth = container.clientWidth || 760;
        });
      });
      chartState.observer.observe(container);
    }
    chartStates.set(container, chartState);
  }
  chartState.data = data;
  const svg = drawChart(container, data, !chartState.rendered);
  chartState.lastWidth = container.clientWidth || 760;
  chartState.rendered = true;
  return svg;
}

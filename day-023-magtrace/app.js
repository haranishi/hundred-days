import { renderChart } from "./lib/chart.js";
import { canUseStorage, clearHistory, readHistory, saveHistory } from "./lib/history.js";
import { formatFetchedAt, formatToday, isCached, yearOverYear } from "./lib/format.js";

const EXAMPLES = ["推し活", "タピオカ", "サウナ", "腸活", "生成AI"];
const TODAY_WORDS = ["防災", "少子化", "地方創生", "腸活", "睡眠", "ミニマリスト", "生成AI", "副業", "リスキリング", "推し活", "サウナ", "昭和レトロ"];
const HOME_TITLE = "MAGTRACE";
const storageAvailable = canUseStorage();

const homeView = document.querySelector("#view-home");
const analysisView = document.querySelector("#view-analysis");
const breadcrumb = document.querySelector("#breadcrumb");
const state = document.querySelector("#analysis-state");
const content = document.querySelector("#analysis-content");
const searchButtons = Array.from(document.querySelectorAll(".search-submit"));
let activeController = null;
let currentQuery = "";
let currentData = null;

const element = (name, className, text) => {
  const node = document.createElement(name);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const normalize = (value) => String(value || "").normalize("NFKC").trim().replace(/[\u0000-\u001f\u007f"'<>\\]/g, "").trim();

// 途中で改行されると読み違えるひとかたまり。数字＋単位＋助詞と、テンプレート文の文節を並べる。
// 先に書いたものが優先されるので、（45件）のような広い形を数字だけの形より前に置く。
const NOWRAP_PATTERNS = [
  /（\d+件(?:・集計途中)?）。?/,
  /約?\d[\d,.]*(?:年|件|倍|%)(?:へ|に|で|を|が|は|の|と)?/,
  /なりました/,
  /現れ(?:、|ました)?/,
  /その年が最多です/,
  /数えました。?/,
  /数えています。?/,
  /記事タイトル一致/,
  /見つけられます。?/,
  /増えました。?/,
  /増えています。?/,
  /減っています。?/,
  /ほぼ横ばいです。?/,
  /掲載数が/,
  /いちばん増えた/,
  /最も増えました/,
  /読み込んでいます/,
];
const NOWRAP_PATTERN = new RegExp(NOWRAP_PATTERNS.map((pattern) => pattern.source).join("|"), "g");

function setPhrasedText(target, text) {
  const value = String(text);
  target.replaceChildren();
  let cursor = 0;
  for (const match of value.matchAll(NOWRAP_PATTERN)) {
    if (match.index > cursor) target.append(document.createTextNode(value.slice(cursor, match.index)));
    target.append(element("span", "nowrap", match[0]));
    cursor = match.index + match[0].length;
  }
  if (cursor < value.length) target.append(document.createTextNode(value.slice(cursor)));
}

function setBusy(busy) {
  searchButtons.forEach((button) => { button.disabled = busy; });
}

function showHome({ focus = false } = {}) {
  activeController?.abort();
  homeView.hidden = false;
  analysisView.hidden = true;
  breadcrumb.hidden = true;
  document.title = HOME_TITLE;
  currentQuery = "";
  if (focus) requestAnimationFrame(() => document.querySelector("#q").focus());
}

function showAnalysis(query) {
  homeView.hidden = true;
  analysisView.hidden = false;
  breadcrumb.hidden = false;
  document.querySelector("#breadcrumb-query").textContent = query;
  document.querySelector("#query-chip").textContent = query;
  document.querySelector("#analysis-title").textContent = `「${query}」の雑誌トレンド`;
  setPhrasedText(document.querySelector("#analysis-subtitle"), "記事タイトルを、発行年ごとに数えています。");
  document.querySelector("#q-again").value = query;
  document.title = `「${query}」の雑誌トレンド | MAGTRACE`;
}

function configureState(type, query = currentQuery) {
  const label = document.querySelector("#state-label");
  const title = document.querySelector("#state-title");
  const body = document.querySelector("#state-body");
  const skeletons = document.querySelector("#skeletons");
  const loadingLive = document.querySelector("#loading-live");
  const actions = document.querySelector("#state-actions");
  const code = document.querySelector("#state-code");
  actions.replaceChildren();
  state.hidden = false;
  content.hidden = true;
  skeletons.hidden = type !== "loading";
  loadingLive.hidden = type !== "loading";
  actions.hidden = type === "loading";
  code.hidden = type !== "error";

  if (type === "loading") {
    label.textContent = "LOADING";
    setPhrasedText(title, "雑誌の流れを読み込んでいます");
    body.textContent = "30年分を年ごとに数えています。通常は数秒、初めての言葉は10秒ほどかかります。";
    return;
  }
  if (type === "empty") {
    label.textContent = "0 RESULTS";
    title.textContent = `「${query}」を題名に含む記事は見つかりませんでした`;
    body.textContent = "言葉を短くするか、別の表記（ひらがな・カタカナ・漢字）で試してください。";
    const chips = element("div", "chips");
    for (const word of EXAMPLES) {
      const button = element("button", "", word);
      button.type = "button";
      button.addEventListener("click", () => navigateToQuery(word));
      chips.append(button);
    }
    const change = element("button", "button button--primary", "検索条件を変える");
    change.type = "button";
    change.addEventListener("click", () => {
      history.pushState({}, "", location.pathname);
      showHome({ focus: true });
      document.querySelector("#q").value = query;
    });
    actions.append(chips, change);
    return;
  }
  label.textContent = "API ERROR";
  title.textContent = "いま、新しいデータを取得できません";
  body.textContent = "データ提供元が一時的に応答していません。入力内容は保持されています。";
  const retry = element("button", "button button--primary", "もう一度試す");
  retry.type = "button";
  retry.addEventListener("click", () => loadTrend(query));
  const home = element("button", "button button--quiet", "ホームへ戻る");
  home.type = "button";
  home.addEventListener("click", () => {
    history.pushState({}, "", location.pathname);
    document.querySelector("#q").value = query;
    showHome();
  });
  actions.append(retry, home);
}

function renderTable(data) {
  const body = document.querySelector("#years-body");
  body.replaceChildren();
  data.years.forEach((item, index) => {
    const row = document.createElement("tr");
    const year = element("th", "", String(item.year));
    year.scope = "row";
    const count = element("td", "", Number.isFinite(item.count) ? String(item.count) : "—");
    const previous = index > 0 ? data.years[index - 1].count : null;
    const change = element("td", "", yearOverYear(item.count, previous));
    row.append(year, count, change);
    body.append(row);
  });
}

function renderClues(clues) {
  const container = document.querySelector("#clues");
  container.replaceChildren();
  clues.forEach((clue, index) => {
    const card = element("article", "clue-card");
    const body = element("p");
    setPhrasedText(body, clue.text);
    card.append(element("p", "clue-card__num", String(index + 1).padStart(2, "0")), element("h3", "", `${clue.year}年`), body);
    container.append(card);
  });
}

function renderRecords(records) {
  const container = document.querySelector("#records");
  container.replaceChildren();
  const years = [...new Set(records.map((record) => record.year))].sort((a, b) => a - b);
  for (const year of years) {
    const group = element("section", "record-group");
    group.append(element("h3", "", `${year}年`));
    const list = element("div", "record-list");
    records.filter((record) => record.year === year).slice(0, 3).forEach((record) => {
      const article = element("article", "record");
      const yearLabel = element("span", "record__year", String(record.year));
      const copy = element("div", "record__copy");
      copy.append(element("h4", "", record.title || "題名不明"));
      if (record.creators?.length) copy.append(element("p", "record__meta", record.creators.join("／")));
      const magazine = element("span", "record__magazine", record.magazine || "掲載誌不明");
      const link = element("a", "button button--quiet record__link", "出典（NDLサーチ）↗");
      link.href = record.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      article.append(yearLabel, copy, magazine, link);
      list.append(article);
    });
    group.append(list);
    container.append(group);
  }
}

function renderRecent() {
  const section = document.querySelector("#recent-section");
  const container = document.querySelector("#recent-list");
  if (!storageAvailable) {
    section.hidden = true;
    return;
  }
  const values = readHistory();
  section.hidden = values.length === 0;
  container.replaceChildren();
  for (const query of values) {
    const button = element("button", "", query);
    button.type = "button";
    button.addEventListener("click", () => navigateToQuery(query));
    container.append(button);
  }
}

function renderResult(data) {
  currentData = data;
  state.hidden = true;
  content.hidden = false;
  setPhrasedText(document.querySelector("#analysis-subtitle"), `${data.total}件の記事タイトルを、発行年ごとに数えました。`);
  const cached = isCached(data.fetchedAt);
  document.querySelector("#cached-badge").hidden = !cached;
  setPhrasedText(document.querySelector("#meta-text"), `取得 ${formatFetchedAt(data.fetchedAt)} ｜ NDLサーチ 雑誌記事索引 ｜ 記事タイトル一致`);
  setPhrasedText(document.querySelector("#finding-lead"), data.analysis.finding.lead);
  setPhrasedText(document.querySelector("#finding-support"), data.analysis.finding.support);
  setPhrasedText(document.querySelector("#stat-total"), `${data.total}件`);
  setPhrasedText(document.querySelector("#stat-peak"), data.analysis.peak ? `${data.analysis.peak.year}年（${data.analysis.peak.count}件）` : "—");
  setPhrasedText(document.querySelector("#stat-jump"), data.analysis.jump ? `${data.analysis.jump.year}年` : "—");
  setPhrasedText(document.querySelector("#trend-title"), data.analysis.headline);
  document.querySelector("#partial-note").hidden = !data.partial;
  const jumpNote = document.querySelector("#jump-note");
  jumpNote.hidden = !data.analysis.jump;
  if (data.analysis.jump) setPhrasedText(jumpNote, `${data.analysis.jump.year}年｜前年${data.analysis.jump.from}件→${data.analysis.jump.to}件（約${data.analysis.jump.ratio}倍）`);
  renderChart(document.querySelector("#chart-wrap"), data);
  renderTable(data);
  renderClues(data.analysis.clues);
  renderRecords(data.records);
  if (storageAvailable) saveHistory(data.query);
  renderRecent();
  document.querySelector("#chart-toggle").textContent = "表で見る";
  document.querySelector("#chart-toggle").setAttribute("aria-pressed", "false");
  document.querySelector("#chart-wrap").hidden = false;
  document.querySelector("#table-wrap").hidden = true;
}

async function loadTrend(query) {
  activeController?.abort();
  const controller = new AbortController();
  activeController = controller;
  currentQuery = query;
  showAnalysis(query);
  configureState("loading", query);
  setBusy(true);
  try {
    const response = await fetch(`/api/day-023/trend?q=${encodeURIComponent(query)}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`MT-${response.status}`);
    const data = await response.json();
    if (controller !== activeController) return;
    if (data.total === 0) configureState("empty", query);
    else renderResult(data);
  } catch (error) {
    if (error?.name !== "AbortError" && controller === activeController) configureState("error", query);
  } finally {
    if (controller === activeController) setBusy(false);
  }
}

function navigateToQuery(value, { push = true } = {}) {
  const query = normalize(value);
  if (!query || query.length > 30) return;
  if (push) history.pushState({}, "", `${location.pathname}?q=${encodeURIComponent(query)}`);
  loadTrend(query);
}

document.querySelector("#search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  navigateToQuery(document.querySelector("#q").value);
});
document.querySelector("#again-form").addEventListener("submit", (event) => {
  event.preventDefault();
  navigateToQuery(document.querySelector("#q-again").value);
});
document.querySelectorAll("[data-search]").forEach((button) => button.addEventListener("click", (event) => navigateToQuery(event.currentTarget.dataset.search)));
document.querySelectorAll("[data-home-link]").forEach((link) => link.addEventListener("click", (event) => {
  event.preventDefault();
  history.pushState({}, "", location.pathname);
  showHome();
}));

document.querySelector("#chart-toggle").addEventListener("click", () => {
  const tableVisible = document.querySelector("#table-wrap").hidden;
  document.querySelector("#table-wrap").hidden = !tableVisible;
  document.querySelector("#chart-wrap").hidden = tableVisible;
  document.querySelector("#chart-toggle").textContent = tableVisible ? "グラフに戻す" : "表で見る";
  document.querySelector("#chart-toggle").setAttribute("aria-pressed", String(tableVisible));
});

document.querySelector("#clear-recent").addEventListener("click", () => {
  clearHistory();
  renderRecent();
});

window.addEventListener("popstate", () => {
  const query = normalize(new URL(location.href).searchParams.get("q"));
  if (query) loadTrend(query);
  else showHome();
});

const today = new Date();
const dayNumber = Math.floor(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 86_400_000);
const todayWord = TODAY_WORDS[((dayNumber % TODAY_WORDS.length) + TODAY_WORDS.length) % TODAY_WORDS.length];
document.querySelector("#today-date").textContent = formatToday(today);
const todayLink = document.querySelector("#today-link");
todayLink.textContent = `「${todayWord}」の30年を見る →`;
todayLink.addEventListener("click", (event) => { event.preventDefault(); navigateToQuery(todayWord); });

const initialQuery = normalize(new URL(location.href).searchParams.get("q"));
if (initialQuery) {
  history.replaceState({}, "", location.pathname);
  history.pushState({}, "", `${location.pathname}?q=${encodeURIComponent(initialQuery)}`);
  loadTrend(initialQuery);
} else {
  showHome();
}

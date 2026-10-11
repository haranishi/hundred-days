"""Import factual references to Japanese public notices; never distribute notice bodies.

Inputs are a pinned public archive ZIP and three public index HTML snapshots.
The HTML indexes are references, not government registers or proof of leakage.
Run with --input-dir pointing to the locally downloaded research snapshots.
"""

import argparse
from collections import Counter, defaultdict
from datetime import date
import hashlib
import html
import json
from pathlib import Path
import re
import unicodedata
from urllib.parse import parse_qsl, quote, unquote, urljoin, urlsplit, urlunsplit
import zipfile


AS_OF = "2026-10-11"
COMMIT = "17fb7a537b6afa106f509a5ad77cbed7712cd3c2"
ARCHIVE = "https://github.com/piyokango/SecurityIncidentArchive"
RESEARCH = Path(__file__).resolve().parents[3] / "docs/day064/research"
BASE_FILES = ["core-incidents.json", "recent-incidents.json", "historical-incidents.json",
              "government-history.json", "ipa-history.json", "ipa-narrative-history.json",
              "supplementary-history.json"]
INDEXES = [
    ("cybersecurity-jp.html", "https://cybersecurity-jp.com/leakage-of-personal-information"),
    ("cybersecurity-jp-2010.html", "https://cybersecurity-jp.com/leakage-of-personal-information/2010-2019"),
    ("cybersecurity-jp-2000.html", "https://cybersecurity-jp.com/leakage-of-personal-information/2000-2009"),
]
FOREIGN_NAMES = re.compile(
    r"Coinbase|Quora|MGMリゾート|Tモバイル|アドビシステムズ|米シティ|米ビザ|米国・|"
    r"N\.T\.Technology|WellBe Holdings|サンリオタウン|ホテルサンルート台北|"
    r"^Eidos|^NEXON$|^peatix", re.I)
SECRET_PARAMETER = re.compile(r"token|secret|signature|password|credential|api.?key|authorization|authkey", re.I)


def company_key(value):
    value = unicodedata.normalize("NFKC", value).lower()
    value = re.sub(r"株式会社|有限会社|学校法人|公益社団法人", "", value)
    return re.sub(r"[\s・.\-（）()]", "", value)


def clean_text(value):
    return " ".join(html.unescape(re.sub(r"<[^>]*>", " ", value)).split())


def public_url(value):
    """Preserve public article query identifiers; reject secret-bearing references."""
    value = html.unescape(value.strip()).replace(" ", "%20")
    parsed = urlsplit(value)
    if parsed.scheme not in ("https", "http") or not parsed.hostname or parsed.username or parsed.password:
        return None
    if any(SECRET_PARAMETER.search(key) for key, _ in parse_qsl(parsed.query, keep_blank_values=True)):
        return None
    # These are published source paths, not endpoints to execute during the import.
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, parsed.query, ""))


def date_value(value):
    value = unicodedata.normalize("NFKC", value).strip()
    match = re.fullmatch(r"(20\d\d)年\s*(\d{1,2})月\s*(\d{1,2}|XX)日", value)
    if not match:
        match = re.fullmatch(r"((?:19|20)\d\d)[/.-](\d{1,2})(?:[/.-](\d{1,2}))?", value)
    if not match:
        return None
    year, month, day = match.groups()
    try:
        precise = date(int(year), int(month), int(day) if day and day != "XX" else 1).isoformat()
    except ValueError:
        return None
    result = precise if day and day != "XX" else precise[:7]
    return result if result <= AS_OF else None


def cause_from_words(value):
    value = unicodedata.normalize("NFKC", value)
    if re.search(r"ランサム[^。\n]{0,15}(?:なし|無い|ない|ません|未確認)", value):
        return "unknown"
    if "ランサム" in value:
        return "ransomware"
    if re.search(r"紛失|盗難|誤廃棄|強盗|不正転売", value):
        return "loss"
    if re.search(r"誤送信|誤送付|誤交付|誤配信|誤操作|処理ミス", value):
        return "mistake"
    if re.search(r"設定不備|設定ミス|誤掲載|公開設定|権限の不備", value):
        return "exposure"
    if re.search(r"内部不正|従業員.{0,12}持ち出し|職員.{0,12}持ち出し", value):
        return "insider"
    if re.search(r"不正アクセス[^。\n]{0,12}(?:ありません|ございません|なかった|なし)", value):
        return "unknown"
    if re.search(r"不正アクセス|不正ログイン|ハッキング|SQLインジェクション|"
                 r"脆弱性.{0,8}悪用|アカウント.{0,12}乗っ取|Web.{0,8}改ざん|"
                 r"ウェブ.{0,8}改ざん|第三者.{0,10}侵入", value, re.I):
        return "intrusion"
    # DDoS and a generic service outage do not establish an intrusion.
    return "unknown"


def parse_archive(path):
    rows = []
    with zipfile.ZipFile(path) as archive:
        for name in sorted(archive.namelist()):
            if not re.search(r"/20\d\d/\d\d/[^/]+\.md$", name):
                continue
            raw = archive.read(name)
            text = raw.decode("utf-8-sig")
            file_path = name.split("/", 1)[1]
            row = {"key": f"archive:{file_path}", "path": file_path,
                   "sha256": hashlib.sha256(raw).hexdigest(), "sourceType": "archive"}
            section = re.search(r"^# 公表概要\s*\n(.*?)(?=^# |\Z)", text, re.M | re.S)
            bullets = [item.strip() for item in re.findall(r"^- (.+)", section.group(1) if section else "", re.M)]
            if len(bullets) < 4:
                row["reason"] = "公表概要の必須項目が不足"
                rows.append(row)
                continue
            title, raw_date, organization = bullets[:3]
            urls = [public_url(item) for item in bullets[3:] if item.startswith(("https:", "http:"))]
            url = next((item for item in urls if item and "github.com/" not in item), None)
            announced = date_value(raw_date)
            body = text.split("# 本文", 1)[-1] if "# 本文" in text else ""
            row.update({"company": organization, "date": announced, "url": url,
                        "archiveUrl": f"{ARCHIVE}/blob/{COMMIT}/{quote(file_path, safe='/')}",
                        "title": title, "references": [], "body": body})
            if not announced or not url:
                row["reason"] = "公表日または公開の原発表URLを確認できない"
            elif announced[:4] != file_path[:4] or announced[5:7] != file_path[5:7]:
                row["reason"] = "公表年月とアーカイブの年月が不一致"
            elif not re.search(r"不正|ランサム|サイバー|マルウェア|ウイルス|漏えい|漏洩|"
                               r"流出|個人情報|改ざん|改竄|乗っ取|盗難|紛失|DDoS|DDos", title + body, re.I):
                row["reason"] = "侵入・情報漏えい等と関連しないシステム障害"
            else:
                row["cause"] = cause_from_words(title)
                if row["cause"] == "unknown":
                    row["cause"] = cause_from_words(body[:900])
                group = re.search(r"^# 事案ID\s*\n- (.+)", text, re.M)
                row["group"] = group.group(1).strip() if group else None
                for item in bullets[4:]:
                    for reference in re.findall(r"https://github\.com/piyokango/SecurityIncidentArchive/blob/main/[^\s]+", item):
                        row["references"].append(unquote(reference.split("/blob/main/", 1)[1]))
            rows.append(row)
    return rows


def parse_index(path, source_url):
    rows = []
    for table in re.findall(r"<table\b[^>]*>(.*?)</table>", path.read_text(), re.S | re.I):
        for tr in re.findall(r"<tr\b[^>]*>(.*?)</tr>", table, re.S | re.I):
            cells = re.findall(r"<td\b[^>]*>(.*?)</td>", tr, re.S | re.I)
            if len(cells) != 5:
                continue
            date_text, organization, _scale, cause, _description = map(clean_text, cells)
            links = re.findall(r"href=[\"']([^\"']+)", cells[1])
            article = public_url(urljoin(source_url, links[0])) if links else None
            announced = date_value(date_text)
            row = {"key": f"index:{path.name}:{len(rows)+1}", "sourceType": "index", "company": organization,
                   "date": announced, "url": article or source_url, "indexUrl": source_url,
                   "cause": cause_from_words(cause), "row": len(rows) + 1}
            if not announced:
                row["reason"] = "記載日を年月または年月日として確認できない"
            elif FOREIGN_NAMES.search(organization):
                row["reason"] = "国内の組織・事案と確認できない海外の事例"
            rows.append(row)
    return rows


class Groups:
    def __init__(self, size):
        self.parents = list(range(size))

    def find(self, index):
        while self.parents[index] != index:
            self.parents[index] = self.parents[self.parents[index]]
            index = self.parents[index]
        return index

    def join(self, first, second):
        self.parents[self.find(second)] = self.find(first)


def group_rows(rows, existing):
    groups = Groups(len(rows))
    by_path = {row.get("path"): index for index, row in enumerate(rows) if row.get("path") and not row.get("reason")}
    by_file = defaultdict(list)
    by_url, by_date, by_group = {}, {}, {}
    existing_url, existing_date = {}, {}
    for record in existing:
        for source in record["sources"]:
            existing_url[public_url(source["url"])] = record["id"]
        existing_date[(company_key(record["company"]), record["announcedAt"])] = record["id"]
    for index, row in enumerate(rows):
        if row.get("reason"):
            continue
        organization = company_key(row["company"])
        if row.get("path"):
            parent, filename = row["path"].rsplit("/", 1)
            by_file[(parent, re.sub(r"^\d\d_", "", filename))].append(index)
        for cache, key in [(by_date, (organization, row["date"])),
                           (by_group, (organization, row.get("group")))]:
            if cache is by_group and not row.get("group"):
                continue
            if key in cache:
                groups.join(index, cache[key])
            else:
                cache[key] = index
        parsed = urlsplit(row["url"])
        # Shared homepages and decade tables are not identifiers for an accident.
        if parsed.path not in ("", "/") and row["url"] not in [url for _, url in INDEXES]:
            key = (organization, row["url"])
            if key in by_url:
                groups.join(index, by_url[key])
            else:
                by_url[key] = index
        row["existingId"] = existing_url.get(row["url"]) or existing_date.get((organization, row["date"]))
    for index, row in enumerate(rows):
        if row.get("reason"):
            continue
        for reference in row.get("references", []):
            target = by_path.get(reference)
            if target is None and "/" in reference:
                parent, filename = reference.rsplit("/", 1)
                candidates = by_file.get((parent, re.sub(r"^\d\d_", "", filename)), [])
                if len(candidates) == 1:
                    target = candidates[0]
            if target is not None and company_key(rows[target]["company"]) == company_key(row["company"]):
                groups.join(index, target)
    combined = defaultdict(list)
    for index, row in enumerate(rows):
        if not row.get("reason"):
            combined[groups.find(index)].append(row)
    return list(combined.values())


def build_record(members):
    official = sorted((row for row in members if row["sourceType"] == "archive"), key=lambda row: (row["date"], row["key"]))
    dated = official or sorted(members, key=lambda row: (row["date"], row["key"]))
    first = dated[0]
    latest = dated[-1]
    digest = hashlib.sha256(first["key"].encode()).hexdigest()[:12]
    cause = latest["cause"] if latest["cause"] != "unknown" else next((row["cause"] for row in reversed(dated) if row["cause"] != "unknown"), "unknown")
    sources, seen = [], set()
    for row in dated + [row for row in members if row not in dated]:
        references = [(row["url"], f"{row['company']}の公表資料（{row['date']}）" if row["sourceType"] == "archive" else f"サイバーセキュリティ.com・参照記事（{row['date']}）", row["date"] if row["sourceType"] == "archive" else None)]
        if row["sourceType"] == "archive":
            references.append((row["archiveUrl"], "公表資料の公開アーカイブ（取得時の保存版）", None))
        elif row["url"] != row["indexUrl"]:
            references.append((row["indexUrl"], "サイバーセキュリティ.com・国内事例一覧（公表日・発生日・報道日を含む）", None))
        for url, title, published in references:
            if url not in seen:
                seen.add(url)
                sources.append({"title": title, "url": url, "publishedAt": published})
    record = {
        "id": f"jp-notice-{first['date'].replace('-', '')}-{digest}",
        "company": first["company"], "shortName": first["company"],
        "aliases": sorted({row["company"] for row in members} - {first["company"]}),
        "sector": "other", "cause": cause, "year": int(first["date"][:4]),
        "announcedAt": first["date"], "sourceUpdatedAt": latest["date"] if len(dated) > 1 and latest["date"] != first["date"] else None,
        "status": "notice", "sourceKind": "official-notice-archive" if official else "news-index",
        "dateKind": "published" if official else "mixed",
        "scale": {"value": None, "unit": "unknown", "qualifier": "undisclosed", "label": "対象人数・件数は原資料を参照（この記録では合計を確定していません）"},
        "summary": f"{first['company']}に関する国内の公表記録です。" + (
            "企業・団体の公表資料を保存した公開アーカイブから、組織名・公表日・原発表への参照を収録しています。侵入や情報流出の有無、調査結果は各原資料で確認できます。"
            if official else "サイバーセキュリティ.comの国内事例一覧に掲載された組織名・記載日・原因区分を収録しています。一覧には公表日・発生日・報道日が混在します。情報流出の有無は記事や原発表で確認してください。"),
        "informationTypes": ["対象の情報項目は原資料を参照"],
        "scopeNote": "日本の企業・団体等に関連する公表・報道の記録。委託元やグループ会社の別公表も含まれ得るため、独立した事故件数や被害人数の統計ではありません。",
        "countNote": "この記録では人数・件数を推定していません。公表と情報流出の確認は別です。原因区分は資料中の用語を整理したもので、侵入先や侵入経路を独立に認定したものではありません。同一URL・明示された事案ID・同じ組織の続報参照はまとめています。",
        "sources": sources,
        "noticeDetails": {"publications": len(members), "hasOfficialArchive": bool(official), "countReviewed": False},
    }
    if len(first["date"]) == 7:
        record["datePrecision"] = "month"
    return record


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", type=Path, required=True)
    args = parser.parse_args()
    existing = []
    for name in BASE_FILES:
        existing.extend(json.loads((RESEARCH / name).read_text())["incidents"])
    archive_path = args.input_dir / "archive.zip"
    all_reports, all_rows = [], []
    inputs = [(archive_path, f"https://codeload.github.com/piyokango/SecurityIncidentArchive/zip/{COMMIT}", "国内インシデント公表アーカイブ", parse_archive(archive_path), "piyokango・国内公表アーカイブ")]
    inputs += [(args.input_dir / name, url, f"国内の事例一覧・{period}", parse_index(args.input_dir / name, url), "サイバーセキュリティ.com・事例索引") for (name, url), period in zip(INDEXES, ["2020年代", "2010年代", "2000年代"])]
    for input_path, url, title, rows, publisher in inputs:
        report = {"title": title, "publisher": publisher, "url": url,
                  "sha256": hashlib.sha256(input_path.read_bytes()).hexdigest(), "tableRows": len(rows),
                  "selection": "組織・日付・参照URL等の事実項目を収録。本文・通知文は配布しません。",
                  "ledger": rows, "inputFile": input_path.name}
        all_reports.append(report)
        all_rows.extend(rows)
    incidents, supplements, patches = [], [], []
    for members in group_rows(all_rows, existing):
        existing_ids = {row.get("existingId") for row in members} - {None}
        if len(existing_ids) > 1:
            for row in members:
                row["reason"] = "複数の既存事故へ参照がつながるため自動統合を保留"
            continue
        record = build_record(members)
        if existing_ids:
            incident_id = next(iter(existing_ids))
            original = next(row for row in existing if row["id"] == incident_id)
            existing_sources = {source["url"] for source in original["sources"]}
            for source in record["sources"]:
                if source["url"] not in existing_sources:
                    supplements.append({"incidentId": incident_id, "source": source})
            for row in members:
                row.update({"disposition": "merged-existing", "incidentIds": [incident_id]})
        else:
            incident_id = record["id"]
            incidents.append(record)
            for index, row in enumerate(sorted(members, key=lambda row: row["key"])):
                row.update({"disposition": "included" if index == 0 else "duplicate", "incidentIds": [incident_id]})
    for report in all_reports:
        for row in report["ledger"]:
            if row.get("reason"):
                row["disposition"] = "excluded"
            # Keep only the audit metadata; no copied headlines, notice bodies or link lists.
            for key in ["body", "title", "references", "group", "existingId", "indexUrl"]:
                row.pop(key, None)
        for kind in ["included", "duplicate", "merged-existing", "excluded"]:
            report[kind] = sum(row["disposition"] == kind for row in report["ledger"])
    output = {"asOf": AS_OF, "archiveCommit": COMMIT,
              "incidents": sorted(incidents, key=lambda row: (row["announcedAt"], row["id"]), reverse=True),
              "supplements": supplements, "patches": patches}
    summary = {"asOf": AS_OF, "archiveCommit": COMMIT, "baseJapaneseRecords": len(existing),
               "addedJapaneseRecords": len(incidents), "totalJapaneseRecords": len(existing) + len(incidents),
               "newCauses": dict(Counter(row["cause"] for row in incidents)),
               "newSourceKinds": dict(Counter(row["sourceKind"] for row in incidents)),
               "newSourceCount": len({source["url"] for row in incidents for source in row["sources"]}),
               "reports": [{key: value for key, value in report.items() if key != "ledger"} for report in all_reports]}
    (RESEARCH / "japan-notices.json").write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n")
    (RESEARCH / "japan-notice-coverage.json").write_text(json.dumps({"asOf": AS_OF, "reports": all_reports}, ensure_ascii=False, separators=(",", ":")) + "\n")
    (RESEARCH / "japan-notice-manifest.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("japan_notices", Path(__file__).resolve().parents[1] / "tools/import-japan-notices.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class JapanNoticeImportTests(unittest.TestCase):
    def test_dates_preserve_month_precision_and_reject_invalid_or_future_dates(self):
        self.assertEqual(module.date_value("2025年1月XX日"), "2025-01")
        self.assertEqual(module.date_value("2005/4/1"), "2005-04-01")
        self.assertIsNone(module.date_value("2025年2月29日"))
        self.assertIsNone(module.date_value("2026年10月12日"))
        self.assertIsNone(module.date_value("日付記載なし"))

    def test_attack_words_do_not_turn_ddos_or_explicit_denials_into_intrusions(self):
        self.assertEqual(module.cause_from_words("DDoS攻撃による接続障害"), "unknown")
        self.assertEqual(module.cause_from_words("不正アクセスはありませんでした。"), "unknown")
        self.assertEqual(module.cause_from_words("ランサムウェアの感染はありません。"), "unknown")
        self.assertEqual(module.cause_from_words("不正アクセスによる情報流出の可能性"), "intrusion")
        self.assertEqual(module.cause_from_words("ランサムウェア攻撃による障害"), "ransomware")

    def test_public_references_keep_article_ids_and_reject_credentials(self):
        self.assertEqual(module.public_url("https://example.com/news.php?id=123"), "https://example.com/news.php?id=123")
        self.assertIsNone(module.public_url("https://example.com/api?access_token=secret"))
        self.assertIsNone(module.public_url("https://name:password@example.com/notice"))
        self.assertIsNone(module.public_url("javascript:alert(1)"))

    def test_explicit_followups_merge_within_organization_and_keep_other_incidents(self):
        rows = [
            {"key": "a", "path": "2025/01/01_社A.md", "sourceType": "archive", "company": "株式会社社A", "date": "2025-01-01", "url": "https://a.example/first", "group": "case1", "references": []},
            {"key": "b", "path": "2025/02/01_社A.md", "sourceType": "archive", "company": "株式会社社A", "date": "2025-02-01", "url": "https://a.example/second", "group": "case1", "references": []},
            {"key": "c", "path": "2025/02/01_社B.md", "sourceType": "archive", "company": "株式会社社B", "date": "2025-02-01", "url": "https://b.example/second", "group": "case1", "references": ["2025/01/01_社A.md"]},
            {"key": "d", "path": "2025/03/01_社A.md", "sourceType": "archive", "company": "株式会社社A", "date": "2025-03-01", "url": "https://a.example/new-incident", "references": []},
        ]
        self.assertEqual(sorted(len(group) for group in module.group_rows(rows, [])), [1, 1, 2])
        existing = [{"id": "original", "company": "株式会社社A", "announcedAt": "2025-01-01", "sources": [{"url": "https://a.example/first"}]}]
        grouped = module.group_rows(rows, existing)
        self.assertEqual(next(group for group in grouped if len(group) == 2)[0]["existingId"], "original")

    def test_an_index_is_not_labeled_as_confirmed_leakage_or_given_an_invented_count(self):
        row = {"key": "index:1", "sourceType": "index", "date": "2019-01-01", "company": "国内社", "url": "https://cybersecurity-jp.com/news/123", "indexUrl": "https://cybersecurity-jp.com/leakage-of-personal-information", "cause": "intrusion"}
        record = module.build_record([row])
        self.assertEqual(record["status"], "notice")
        self.assertEqual(record["dateKind"], "mixed")
        self.assertEqual(record["sourceKind"], "news-index")
        self.assertIsNone(record["scale"]["value"])
        self.assertEqual(record["scale"]["unit"], "unknown")

    def test_foreign_index_entries_and_undated_rows_have_exclusion_reasons(self):
        content = "<table><tr><td>2025/1/1</td><td>Coinbase</td><td>1万件</td><td>不正アクセス</td><td>本文を配布しない</td></tr><tr><td>不明</td><td>国内社</td><td>不明</td><td>不明</td><td>不明</td></tr></table>"
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "index.html"
            path.write_text(content)
            rows = module.parse_index(path, "https://cybersecurity-jp.com/leakage-of-personal-information")
        self.assertEqual(len(rows), 2)
        self.assertTrue(all(row.get("reason") for row in rows))


if __name__ == "__main__":
    unittest.main()

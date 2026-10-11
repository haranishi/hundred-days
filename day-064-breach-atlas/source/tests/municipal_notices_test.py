# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 haranishi
# See ../tools/LICENSE-AGPL-3.0.txt for terms and the warranty disclaimer.
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('municipal_notices', Path(__file__).resolve().parents[1] / 'tools/import-municipal-notices.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class MunicipalNoticeImportTests(unittest.TestCase):
    def row(self, **changes):
        return {'row': 1, 'page': 2, 'publishedAt': '2025-01-17', 'receivedAt': '2024-12-12',
                'department': '市民局 市民課', 'subject': '書類の紛失', 'count': '1名', 'cause': 'loss',
                'referenceUrl': 'https://www.city.yokohama.lg.jp/public/report.pdf',
                'announcementUrl': 'https://www.city.yokohama.lg.jp/public/report.html', **changes}

    def test_pdf_split_digits_and_cross_year_receipt_preserve_real_dates(self):
        self.assertEqual(module.full_date('令和４年１月1 7 日'), '2022-01-17')
        self.assertEqual(module.received_date('12 月 12 日', '2025-01-17'), '2024-12-12')
        self.assertIsNone(module.received_date('令和7年1月18日', '2025-01-17'))
        self.assertIsNone(module.full_date('令和7年2月29日'))

    def test_mixed_people_and_organizations_do_not_become_an_invented_total(self):
        self.assertEqual(module.count_scale('1,234名分')['value'], 1234)
        for count in ('12名・3法人', '2名（うち1名）', '約100名', '不明'):
            self.assertIsNone(module.count_scale(count)['value'])
            self.assertEqual(module.count_scale(count)['unit'], 'unknown')
        self.assertIn('おそれ', module.count_scale('1名')['label'])

    def test_no_target_and_unverifiable_dates_are_excluded(self):
        for count in ('なし', '―', 'ー', '', '0人', '０名分'):
            self.assertIsNotNone(module.exclusion_reason(self.row(count=count)))
        self.assertIsNotNone(module.exclusion_reason(self.row(receivedAt=None)))
        self.assertIsNone(module.exclusion_reason(self.row(count='不明')))

    def test_rows_on_the_same_day_keep_distinct_ids_and_reference_page_numbers(self):
        first = module.build_record(self.row(), '横浜市')
        second = module.build_record(self.row(row=2), '横浜市')
        self.assertNotEqual(first['id'], second['id'])
        self.assertEqual(first['id'], module.build_record(self.row(), '横浜市')['id'])
        self.assertEqual(first['sources'][0]['url'].split('#')[1], 'page=2')
        self.assertEqual(first['announcedAt'], '2025-01-17')
        self.assertEqual(first['municipalDetails']['receivedAt'], '2024-12-12')
        self.assertEqual(first['status'], 'notice')

    def test_explicit_negative_attack_statements_do_not_become_intrusions(self):
        self.assertEqual(module.cause_from_words('不正アクセスはありませんでした。'), 'unknown')
        self.assertEqual(module.cause_from_words('ランサムウェア感染はなかった。'), 'unknown')
        self.assertEqual(module.cause_from_words('不正アクセスにより情報漏えい'), 'intrusion')
        self.assertEqual(module.cause_from_words('通知書の誤送付'), 'mistake')

    def test_only_unauthenticated_public_references_are_allowed(self):
        self.assertEqual(module.public_key('https://example.jp/a.pdf#page=2'), 'https://example.jp/a.pdf')
        for url in ('https://name:password@example.jp/a', 'https://example.jp/a?token=secret', 'file:///a'):
            with self.assertRaises(ValueError):
                module.public_key(url)

    def test_public_fields_keep_facts_without_source_headings_or_contact_numbers(self):
        record = module.build_record(self.row(department='市民局 市民課 045-123-4567',
                                              subject='転載しない元の件名'), '横浜市')
        self.assertEqual(record['municipalDetails']['department'], '市民局 市民課')
        self.assertEqual(record['municipalDetails']['classification'], '紛失・盗難など')
        self.assertNotIn('転載しない元の件名', str(record))
        self.assertNotIn('045-123-4567', str(record))


if __name__ == '__main__':
    unittest.main()

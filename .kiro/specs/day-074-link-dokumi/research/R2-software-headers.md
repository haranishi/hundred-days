# 調査R2：旧ソフトウェア・JavaScript・HTTPセキュリティヘッダー

調査・状態判定日：**2026-10-22**。以下の全表・引用・根拠URLの確認日は2026-10-22（各行に適用）。将来日付は公表された予定であり、サポートの永続保証ではない。古い告知の発行年は本文に併記した。`unverified` は確認不能で、推奨判定・自動断定に使わない。

この資料は運営者の防御設定の評価用。EOL、ライブラリの版、ヘッダー不足から「詐欺サイト」「侵害済み」とは判定できない。URL・ヘッダーから観測できた事実と、その事実からの限定的な推定を分けて表示する。

## C. サーバーソフトウェアのサポート

### C-1. PHP 5.6～8.5

上流PHPプロジェクトの期限。配布元による延長保守は別。現行表は通常2年＋セキュリティ2年の方針だが、過去の版へ一律に遡及しない。[現行方針・期限](https://www.php.net/supported-versions.php)、[旧系統EOL](https://www.php.net/eol.php)。

| 製品 | 系統 | 通常サポート終了 | セキュリティ修正の終了 | 2026-10-22時点 | 根拠URL |
|---|---|---|---|---|---|
| PHP | 5.6 | 2017-01-19 | 2018-12-31 | EOL | [公式サイトの期限データ](https://raw.githubusercontent.com/php/web-php/master/include/branches.inc)、[EOL表](https://www.php.net/eol.php) |
| PHP | 7.0 | 2018-01-04 | 2019-01-10 | EOL | [公式期限データ](https://raw.githubusercontent.com/php/web-php/master/include/branches.inc)、[EOL表](https://www.php.net/eol.php) |
| PHP | 7.1 | 2018-12-01 ※ | 2019-12-01 | EOL | [公式算出規則](https://raw.githubusercontent.com/php/web-php/master/include/branches.inc)、[EOL表](https://www.php.net/eol.php) |
| PHP | 7.2 | 2019-11-30 ※ | 2020-11-30 | EOL | [公式算出規則](https://raw.githubusercontent.com/php/web-php/master/include/branches.inc)、[EOL表](https://www.php.net/eol.php) |
| PHP | 7.3 | 2020-12-06 ※ | 2021-12-06 | EOL | [公式算出規則](https://raw.githubusercontent.com/php/web-php/master/include/branches.inc)、[EOL表](https://www.php.net/eol.php) |
| PHP | 7.4 | 2021-11-28 ※ | 2022-11-28 | EOL | [公式算出規則](https://raw.githubusercontent.com/php/web-php/master/include/branches.inc)、[EOL表](https://www.php.net/eol.php) |
| PHP | 8.0 | 2022-11-26 ※ | 2023-11-26 | EOL | [公式算出規則](https://raw.githubusercontent.com/php/web-php/master/include/branches.inc)、[EOL表](https://www.php.net/eol.php) |
| PHP | 8.1 | 2023-11-25 ※ | 2025-12-31 | EOL | [公式算出規則](https://raw.githubusercontent.com/php/web-php/master/include/branches.inc)、[EOL表](https://www.php.net/eol.php) |
| PHP | 8.2 | 2024-12-31 | 2026-12-31 | セキュリティ修正のみ | [現行表](https://www.php.net/supported-versions.php) |
| PHP | 8.3 | 2025-12-31 | 2027-12-31 | セキュリティ修正のみ | [現行表](https://www.php.net/supported-versions.php) |
| PHP | 8.4 | 2026-12-31 | 2028-12-31 | 通常サポート | [現行表](https://www.php.net/supported-versions.php) |
| PHP | 8.5 | 2027-12-31 | 2029-12-31 | 通常サポート | [現行表](https://www.php.net/supported-versions.php) |

※ 旧系統の通常期限は現行のEOL表に列がないため、公式サイト公開ソースの「8.2未満は初回リリースから2年」という規則に基づく算出値。5.6・7.0の例外日は同ソースの明示値。EOL日は表の明示値を優先した。PHP 6は正式リリースされていないため対象行なし。

### C-2. Apache HTTP Server / nginx

| 製品 | 系統 | 通常サポート終了 | セキュリティ修正の終了 | 2026-10-22時点 | 根拠URL |
|---|---|---|---|---|---|
| Apache HTTP Server | 2.2 | 独立した通常期限の区分なし | **2017-12（月まで確認、日はunverified）** | EOL。最終リリース2.2.34の2017年7月とEOLを混同しない | [公式脆弱性ページ](https://httpd.apache.org/security/vulnerabilities_22.html?cve=title)、[公式トップ](https://httpd.apache.org/) |
| Apache HTTP Server | 2.4 | 終了日未公表 | 終了日未公表 | 現行の保守系統。ただし全パッチ版が安全という意味ではない | [公式トップ](https://httpd.apache.org/) |
| nginx Open Source | Mainline / Stable | 固定日付のEOL表を確認できず（unverified） | 同左 | 配布ページではMainline=1.31.x、Stable=1.30.x。以前の版はLegacy分類 | [公式配布ページ](https://nginx.org/en/download.html)、[公式導入説明](https://docs.nginx.com/nginx/admin-guide/installing-nginx/installing-nginx-open-source/) |

nginx公式説明の原文引用：

> NGINX Open Source is available in two versions: Mainline and Stable.

Mainlineは機能・不具合・セキュリティ修正を含む開発系列で、本番利用も推奨される。Stableは主に重要な不具合・セキュリティ修正をMainlineから取り込む系列。**今回の公式説明にPHPのような固定EOL期限表は無い。「nginxにはEOLの概念が一切無い」とする主張はunverified**。NGINX Plusの契約サポートやOS配布元の保守と混同しない。[F5/NGINX公式説明](https://docs.nginx.com/nginx/admin-guide/installing-nginx/installing-nginx-open-source/)

### C-3. Microsoft IIS と Windows Server

IISはWindowsのコンポーネントとしてOSのライフサイクルに従う。[Microsoft IIS Lifecycle](https://learn.microsoft.com/lifecycle/products/internet-information-services-iis)。日付はMicrosoftのPTの終了日として記載。取得したLifecycle表の一部は終了時刻を翌日06:59:59等と表示したため、UTC相当の時刻表示をそのまま日付にせずPTへ換算し、告知本文とも照合した。最新SP・必要な更新の適用が前提。

| 製品 | 系統／対応Windows Server | 通常（Mainstream）終了 | セキュリティ修正の終了（Extended／ESU） | 2026-10-22時点 | 根拠URL |
|---|---|---|---|---|---|
| IIS | 6.0／2003・2003 R2 | 2010-07-13（R2で確認） | 2015-07-14 | 終了 | [IIS対応表](https://learn.microsoft.com/lifecycle/products/internet-information-services-iis)、[Server 2003 R2](https://learn.microsoft.com/en-us/lifecycle/products/windows-server-2003-r2)、[2015年公式終了告知](https://www.microsoft.com/en-us/windows-server/blog/2015/07/14/migration-is-worth-it-support-for-windows-server-2003-ends-today/) |
| IIS | 7.0／2008 | 2015-01-13 | Extended 2020-01-14、ESU 2023-01-10、Azure限定4年目2024-01-09 | ESU含め終了 | [Server 2008](https://learn.microsoft.com/en-us/lifecycle/products/windows-server-2008) |
| IIS | 7.5／2008 R2 | 2015-01-13 | Extended 2020-01-14、ESU 2023-01-10、Azure限定4年目2024-01-09 | ESU含め終了 | [Server 2008 R2](https://learn.microsoft.com/en-us/lifecycle/products/windows-server-2008-r2) |
| IIS | 8.0／2012 | 2018-10-09 | Extended 2023-10-10、ESU 2026-10-13 | **ESUも終了** | [Server 2012](https://learn.microsoft.com/en-us/lifecycle/products/windows-server-2012)、[ESU公式告知](https://learn.microsoft.com/lifecycle/announcements/windows-server-2012-r2-end-of-support) |
| IIS | 8.5／2012 R2 | 2018-10-09 | Extended 2023-10-10、ESU 2026-10-13 | **ESUも終了** | [Server 2012 R2](https://learn.microsoft.com/en-us/lifecycle/products/windows-server-2012-r2)、[ESU公式告知](https://learn.microsoft.com/lifecycle/announcements/windows-server-2012-r2-end-of-support) |
| IIS | 10.0／2016 | 2022-01-11 | Extended 2027-01-12 | Extended中 | [Server 2016](https://learn.microsoft.com/en-us/lifecycle/products/windows-server-2016) |
| IIS | 10.0／2019 | 2024-01-09 | Extended 2029-01-09 | Extended中 | [Server 2019](https://learn.microsoft.com/en-us/lifecycle/products/windows-server-2019) |
| IIS | 10.0／2022 | 2026-10-13 | Extended 2031-10-14 | Extended中 | [Server 2022](https://learn.microsoft.com/en-us/lifecycle/products/windows-server-2022)、[Microsoft公式IIS10対応説明](https://github.com/MicrosoftDocs/windowsserverdocs/blob/main/WindowsServerDocs/administration/performance-tuning/role/web-server/tuning-iis-10.md) |

`Microsoft-IIS/10.0`だけではOSを区別できず、終了日を一意に選べない。Windowsクライアント版でも同じIIS番号が使われる。Server 2025のOS自体の期限はMainstream 2029-11-13、Extended 2034-11-14だが、今回Microsoft一次資料によるIIS10との明示対応確認は **unverified** とし、自動マッピング推奨から除外する。[Server 2025 Lifecycle](https://learn.microsoft.com/en-us/lifecycle/products/windows-server-2025)

### C-4. ASP.NET / .NET Framework

`X-Powered-By: ASP.NET`は版情報を含まない。`X-AspNet-Version`の1.1/2.0/4.0系表示を、そのまま現在インストールされたFrameworkの具体版と扱わない。4.xはCLR 4、2.0/3.0/3.5はCLR 2を共有する。[Microsoftの版と依存関係](https://learn.microsoft.com/en-us/dotnet/framework/install/versions-and-dependencies)、[OWASPのヘッダー記述修正記録（2025年）](https://github.com/OWASP/www-project-secure-headers/issues/215)

| 製品 | 系統 | 通常サポート終了 | セキュリティ修正の終了 | 2026-10-22時点／表示の扱い | 根拠URL |
|---|---|---|---|---|---|
| .NET Framework | 1.1 SP1 | unverified | 一般の終了2013-10-08、Server 2003上の例外2015-07-14 | 終了。ヘッダーだけでインストール状態は確証不可 | [Microsoft FAQ](https://learn.microsoft.com/en-us/lifecycle/faq/dotnet-framework) |
| .NET Framework | 2.0（単体） | unverified | 製品表2011-07-12 | 単体は終了。ただし次行の例外を必ず考慮 | [Lifecycle](https://learn.microsoft.com/en-us/lifecycle/products/microsoft-net-framework) |
| .NET Framework | 2.0 SP2／3.0 SP2（3.5 SP1の構成要素） | OS・製品条件依存 | 3.5 SP1がサポートされる限り構成要素も対象。3.5 SP1の独立製品期限2029-01-09、古いOSではOS依存 | `2.0.50727`だけで一律EOL判定不可 | [FAQ](https://learn.microsoft.com/en-us/lifecycle/faq/dotnet-framework)、[現行配布・終了表](https://dotnet.microsoft.com/en-us/download/dotnet-framework) |
| .NET Framework | 4.0 / 4.5 / 4.5.1（具体版が別途判明した場合） | 独立した通常期限unverified | 2016-01-12（Server 2003上4.0は2015-07-14） | 終了。ただし`4.0.30319`は4.8等でも現れる | [FAQ](https://learn.microsoft.com/en-us/lifecycle/faq/dotnet-framework) |
| .NET Framework | 4.5.2 / 4.6 / 4.6.1 | OS依存 | 2022-04-26。4.6のWindows 10 Enterprise LTSC 2015例外も2025年10月まで | 終了 | [FAQ](https://learn.microsoft.com/en-us/lifecycle/faq/dotnet-framework) |
| .NET Framework | 4.6.2 | OS依存 | **2027-01-12**（OSが先に終了する場合はOS条件も必要） | 対応するサポート中OS上で保守対象 | [Lifecycle](https://learn.microsoft.com/en-us/lifecycle/products/microsoft-net-framework)、[現行終了表](https://dotnet.microsoft.com/en-us/download/dotnet-framework) |
| .NET Framework | 4.7 / 4.7.1 / 4.7.2 / 4.8 / 4.8.1 | OS依存 | 一律固定日なし。対応OS・必要な更新のライフサイクル依存 | 4.xの番号だけでは判定不能 | [FAQ](https://learn.microsoft.com/en-us/lifecycle/faq/dotnet-framework)、[Lifecycle](https://learn.microsoft.com/en-us/lifecycle/products/microsoft-net-framework) |

FAQの1.1説明には1.0という表記が混じる箇所があるため、1.1の通常終了日は確認済み値に含めない。.NET（旧.NET Coreを含む）と.NET Frameworkの保守期限は別物。

### C-5. OpenSSL

公開される上流サポートの期限。契約延長保守やOS配布元の保守は別。LTSは最終年がセキュリティ修正中心という方針で、下表の「通常終了」に算出値はその旨を明記する。[2026年改訂の公式方針](https://openssl-library.org/policies/releasestrat/)

| 製品 | 系統 | 通常サポート終了 | セキュリティ修正の終了 | 2026-10-22時点 | 根拠URL |
|---|---|---|---|---|---|
| OpenSSL | 1.0.2 LTS | 2018-12-31 | 2019-12-31 | 上流公開保守終了 | [2018年公式ML説明](https://mta.openssl.org/pipermail/openssl-users/2018-September/008702.html)、[2018年公式方針更新記録](https://mta.openssl.org/pipermail/openssl-commits/2018-September/020171.html) |
| OpenSSL | 1.1.0 | 2018-09-11からセキュリティ修正のみ | 2019-09-11 | 終了 | [2018年公式ML](https://mta.openssl.org/pipermail/openssl-users/2018-September/008702.html)、[2019年公式告知](https://mta.openssl.org/pipermail/openssl-users/2019-September/011126.html) |
| OpenSSL | 1.1.1 LTS | 最終年開始2022-09-11（方針からの算出） | 2023-09-11 | 上流公開保守終了 | [2023年EOL告知](https://openssl-library.org/post/2023-09-11-eol-111/)、[LTS方針](https://openssl-library.org/policies/releasestrat/) |
| OpenSSL | 3.0 LTS | 最終年開始2025-09-07（方針からの算出） | **2026-09-07** | 上流公開保守終了 | [2026年EOL告知](https://openssl-library.org/post/2026-09-16-eol30/) |
| OpenSSL | 3.1 | 通常／セキュリティの別期限なし | 2025-03-14 | 終了 | [公式2023年告知の期限記載](https://openssl-library.org/post/2023-09-11-eol-111/) |
| OpenSSL | 3.2 | 同上 | 2025-11-23 | 終了 | [公式ミラーの方針表](https://mirror.openssl-library.org/policies/releasestrat/index.html) |
| OpenSSL | 3.3 | 同上 | 2026-04-09 | 終了 | [公式ミラーの方針表](https://mirror.openssl-library.org/policies/releasestrat/index.html) |
| OpenSSL | 3.4 | 同上 | **2026-10-22** | **期限当日**。終了時刻・タイムゾーンはunverified | [現行方針](https://openssl-library.org/policies/releasestrat/) |
| OpenSSL | 3.5 LTS | 最終年開始2029-04-08（方針からの算出） | 2030-04-08 | サポート中 | [現行方針](https://openssl-library.org/policies/releasestrat/) |
| OpenSSL | 3.6 | 通常／セキュリティの別期限なし | 2026-11-01 | サポート中、期限が近い | [現行方針](https://openssl-library.org/policies/releasestrat/) |

「3.xなら現行」は誤り。3.0は終了済み、3.4は期限当日、3.5はLTSという違いがある。上流自身が、OS提供の`.rpm`/`.deb`等では保守期間が異なり得ると明記している。[公式EOL告知](https://openssl-library.org/post/2023-09-11-eol-111/)

### C-6. Apache Tomcat

| 製品 | 系統 | 通常サポート終了 | セキュリティ修正の終了 | 2026-10-22時点 | 根拠URL |
|---|---|---|---|---|---|
| Tomcat | 6.0 | 2016-12-31 | 2016-12-31 | EOL | [2015年公式告知](https://tomcat.apache.org/tomcat-60-eol.html) |
| Tomcat | 7.0 | 2021-03-31 | 2021-03-31 | EOL | [2020年公式告知](https://tomcat.apache.org/tomcat-70-eol.html) |
| Tomcat | 8.5 | 2024-03-31 | 2024-03-31 | EOL | [2022年公式告知](https://tomcat.apache.org/tomcat-85-eol.html) |
| Tomcat | 9.0 | 未確定。2027-03-31より前には終了しない見込み | 同左 | サポート中 | [公式対応・方針](https://tomcat.apache.org/whichversion.html) |
| Tomcat | 10.1 | 未公表 | 未公表 | サポート中 | [公式対応表](https://tomcat.apache.org/whichversion.html) |
| Tomcat | 11.0 | 未公表 | 未公表 | サポート中 | [公式対応表](https://tomcat.apache.org/whichversion.html) |

9系全体を2027-03-31にEOLとするのは不正確。公式には9.0の後に9.1で延長保守する計画があり、9.1の期限は未定。`Server: Apache-Coyote`のように製品の具体版がない場合、この表から系統を補完しない。[公式方針](https://tomcat.apache.org/whichversion.html)

### C-7. バックポートと診断文言

Red Hatは、新版のセキュリティ修正を旧版へ取り込み、上流の版番号が同じままになる運用と、版だけを比較するツールの誤検出を説明している。[Red Hat Security Backporting Practice](https://access.redhat.com/security/updates/backporting)

採用できる表示は「ヘッダーはPHP 7.4系を示しています。上流保守は終了済みです。配布元の延長保守・修正適用状況はこの診断では確認できません」。**古い番号でも修正済みの可能性があり、安全とも危険とも番号だけでは断定できない**。依頼文の「古くても安全とは限らない」だけではバックポートの注意点が伝わらないため、この両方向を明記する。ヘッダーはプロキシが付与・除去できるため、観測値と実バックエンドも区別する。

## D. 古いJavaScriptライブラリの代表的な既知脆弱性

全行の確認日：2026-10-22。表の修正版は**そのCVEの修正が入った版**であり、2026年の導入推奨版を意味しない。範囲は指定パッケージに対するもの。CVSSは出典の現行値・版を併記し、利用サイトの実害の確定や詐欺確率には変換しない。

| ライブラリ | 影響する版の範囲 | 修正された版 | CVE / GHSA | 深刻度（評価元） | 一言の説明・成立条件 | 根拠URL |
|---|---|---|---|---|---|---|
| jQuery（jquery） | `>=1.1.4, <3.4.0` | 3.4.0 | CVE-2019-11358 / GHSA-6c3j-c64m-qhgq | CVSS 3.1 **6.1 Medium**（NVD） | 未信頼オブジェクトをdeep extendするとプロトタイプ汚染 | [GHSA](https://github.com/advisories/GHSA-6c3j-c64m-qhgq)、[NVD](https://nvd.nist.gov/vuln/detail/cve-2019-11358) |
| jQuery（jquery） | DB明示は`>=1.12.0, <3.5.0`。上流告知は`>=1.2, <3.5.0`で下限相違 | 3.5.0 | CVE-2020-11022 / GHSA-gxr4-xjj5-5px2 | CVSS 3.1 **6.9 Moderate**（現行GHSA） | 未信頼HTMLを`.html()`等へ渡す経路でXSS | [現行DB](https://github.com/advisories/GHSA-gxr4-xjj5-5px2)、[上流アドバイザリ](https://github.com/jquery/jquery/security/advisories/GHSA-gxr4-xjj5-5px2) |
| jQuery（jquery） | `>=1.0.3, <3.5.0` | 3.5.0 | CVE-2020-11023 / GHSA-jpcq-cgw6-v4j6 | CVSS 3.1 **6.9 Moderate**（現行GHSA） | 未信頼の`option`を含むHTMLをDOM操作へ渡す経路でXSS | [GHSA](https://github.com/advisories/GHSA-jpcq-cgw6-v4j6) |
| jQuery UI（jquery-ui） | `<1.13.0` | 1.13.0 | CVE-2021-41184 / GHSA-gpqq-952q-5327 | CVSS 3.1 **6.5 Moderate**（現行GHSA） | `.position()`の`of`へ未信頼文字列を渡すとXSS | [上流告知](https://github.com/jquery/jquery-ui/security/advisories/GHSA-gpqq-952q-5327)、[現行DB](https://github.com/advisories/GHSA-gpqq-952q-5327) |
| jQuery UI（jquery-ui） | `<1.13.2` | 1.13.2 | CVE-2022-31160 / GHSA-h6gj-6jjq-h8g9 | CVSS 3.1 **6.1 Medium**（NVD / CNA） | checkboxradioのrefreshでラベル中のHTML実体参照を誤復号しXSS | [上流告知](https://github.com/jquery/jquery-ui/security/advisories/GHSA-h6gj-6jjq-h8g9)、[NVD](https://nvd.nist.gov/vuln/detail/cve-2022-31160) |
| Bootstrap（bootstrap） | `>=3.0.0, <3.4.1` または `>=4.0.0, <4.3.1` | 3.4.1 / 4.3.1 | CVE-2019-8331 / GHSA-9v3m-8fp8-mj99 | CVSS 3.1 **6.1 Moderate**（GHSA） | tooltip/popoverの`data-template`でXSS。JSプラグインが対象 | [GHSA](https://github.com/advisories/GHSA-9v3m-8fp8-mj99) |
| AngularJS 1.x（angular） | `<=1.8.3`、告知は全AngularJS版と説明 | 上流なし | CVE-2024-8373 / GHSA-mqm9-c95h-x2p6 | CVSS 4.0 **2.9 Low**（GHSA） | `source`要素の`srcset`サニタイズ不備による画像元制限回避・コンテンツ偽装 | [GHSA](https://github.com/advisories/GHSA-mqm9-c95h-x2p6) |
| lodash（lodash） | `<4.17.12` | 4.17.12 | CVE-2019-10744 / GHSA-jf85-cpcp-j695 | CVSS 3.1 **9.1 Critical**（現行GHSA） | `defaultsDeep`で未信頼入力からプロトタイプ汚染 | [GHSA](https://github.com/advisories/GHSA-jf85-cpcp-j695) |
| lodash（lodash） | `>=3.7.0, <4.17.19`（GHSAのnpm lodash） | 4.17.19（GHSA） | CVE-2020-8203 / GHSA-p6mc-m468-83gw | CVSS 3.1 **7.4 High**（GHSA / NVD） | 深いプロパティ操作を未信頼入力が制御する場合のプロトタイプ汚染。下記相違に注意 | [GHSA](https://github.com/advisories/GHSA-p6mc-m468-83gw)、[NVD](https://nvd.nist.gov/vuln/detail/cve-2020-8203) |
| moment.js（moment） | `>=2.18.0, <2.29.4` | 2.29.4 | CVE-2022-31129 / GHSA-wc69-rhjr-hc9g | CVSS 3.1 **7.5 High**（GHSA） | 長い未信頼文字列をRFC2822日付解析へ渡すとReDoS | [GHSA](https://github.com/advisories/GHSA-wc69-rhjr-hc9g) |
| Vue 2（vue） | `>=2.0.0-alpha.1, <3.0.0-alpha.0` | GHSA記載3.0.0-alpha.0。上流2系修正版なし | CVE-2024-9506 / GHSA-5j4c-8p2g-v4jx | CVSS 4.0 **2.9 Low**（GHSA） | テンプレートの`parseHTML`への細工入力でReDoS。事前コンパイル済みだけの構成へ一律断定不可 | [GHSA](https://github.com/advisories/GHSA-5j4c-8p2g-v4jx) |

下限が明示されない`<版`はアドバイザリの表記であり、ライブラリの誕生以前や該当機能の存在しない版について独自に検証した意味ではない。

**範囲・点数の相違の扱い**：CVE-2020-11022の1.2以上1.12.0未満は両資料の一致が取れず`unverified`として自動判定推奨から除外する。別件11023の確認済み範囲と混ぜない。lodashの8203についてNVDは`<4.17.20`、現行GHSAはnpm `lodash`の修正4.17.19、`lodash-es`の修正4.17.20と分かれる。**lodash 4.17.19の自動断定はunverified**とし、パッケージを区別する。4.17.19未満の重なる範囲は根拠付きの候補表示に使える。CVSSは評価元で異なるため、昔の6.1や9.8という紹介値で上表の現行GHSA値を上書きしない。[11022両資料](https://github.com/advisories/GHSA-gxr4-xjj5-5px2)、[lodash GHSA](https://github.com/advisories/GHSA-p6mc-m468-83gw)、[lodash NVD](https://nvd.nist.gov/vuln/detail/cve-2020-8203)

### D-1. AngularJS / Vue 2 のEOL

| ライブラリ | 上流の終了日 | 2026-10-22時点 | 根拠URL |
|---|---|---|---|
| AngularJS 1.x | **2021-12-31までLTS、2022年1月から終了** | 上流サポート終了。Angular（2以降）とは別製品 | [2022年公式終了告知](https://blog.angular.dev/discontinued-long-term-support-for-angularjs-cc066b82e65a)、[公式ドキュメントの終了表示](https://docs.angularjs.org/misc/version-support-status) |
| Vue 2 | **2023-12-31** | 新機能・更新・修正の上流提供終了。CDNに残っていることは保守継続の証拠にならない | [公式EOLページ](https://v2.vuejs.org/eol/) |

有償の延長保守版・独自パッチは通常の上流版と区別し、URLの版番号だけでその契約有無を推定しない。

### D-2. CDN・ファイル名からの版抽出例

以下は**本調査の正規表現提案**であり、ベンダーが保証する検出規格ではない。実装コードは作成していない。まずHTMLから得た`src`を文書URL・`base`に従って解決し、URLの**hostnameを完全一致で検査した後、pathnameだけ**に照合する。query/fragmentは版情報にしない。キャプチャ1が完全版`x.y.z`となる例：

| hostname／対象 | pathname用正規表現例 | 入力例 → 抽出版 |
|---|---|---|
| `code.jquery.com` | `^/jquery-(\d+\.\d+\.\d+)(?:\.slim)?(?:\.min)?\.js$` | `https://code.jquery.com/jquery-3.6.0.min.js` → 3.6.0 |
| `cdnjs.cloudflare.com` | `^/ajax/libs/jquery/(\d+\.\d+\.\d+)/jquery(?:\.slim)?(?:\.min)?\.js$` | `https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js` → 3.6.0 |
| `cdn.jsdelivr.net` | `^/npm/jquery@(\d+\.\d+\.\d+)(?:/.*)?$` | `https://cdn.jsdelivr.net/npm/jquery@3.6.0` → 3.6.0 |
| `ajax.googleapis.com` | `^/ajax/libs/jquery/(\d+\.\d+\.\d+)/jquery(?:\.min)?\.js$` | `https://ajax.googleapis.com/ajax/libs/jquery/1.12.4/jquery.min.js` → 1.12.4 |
| `unpkg.com` | `^/lodash@(\d+\.\d+\.\d+)(?:/.*)?$` | `https://unpkg.com/lodash@4.17.15/lodash.js` → 4.17.15 |
| 自サイトのローカルファイル | `^/js/jquery-(\d+\.\d+\.\d+)(?:\.min)?\.js$` | `/js/jquery-1.11.3.min.js` → 1.11.3 |

URL構造の一次資料：[jQuery配布](https://jquery.com/download/)、[cdnjsライブラリ](https://cdnjs.com/libraries/jquery)、[Google Hosted Libraries](https://developers.google.com/speed/libraries)、[jsDelivr公式README](https://raw.githubusercontent.com/jsdelivr/jsdelivr/master/README.md)、[UNPKG公式のpkg@ver説明](https://unpkg.com/)。確認日2026-10-22。

これらは限定的な例。`jquery-ui`、`bootstrap`、`angular`、`lodash`、`moment`、`vue`は別の名前として登録し、名前の部分一致で混同しない。`@latest`、`@3`、`@^3.6.0`、`@~3.6.0`、版なし、ファイルのハッシュだけなら具体版は`unverified`。UNPKG等は範囲・タグも許すが、今回の1回取得ではCDNへ追加アクセスして解決しない。プレリリース・ビルドメタデータを上の例で無理に通常版として扱わない。

**観測の限界**：ファイル名は改名でき、バックポート済み配布物もあり得る。`script src`が見つかっただけでは内容一致・実行成功・脆弱な関数への入力経路は未確認。BootstrapのCSSだけからJSプラグインの脆弱性を検出しない。表示は「既知脆弱性の影響範囲と一致する版表記を検出。実際の影響は未確認」が適切。

## F. セキュリティヘッダーの基準

### F-1. MDN HTTP Observatoryの採点と確認できた不整合

確認日2026-10-22。[MDN Tests & Scoring](https://developer.mozilla.org/en-US/observatory/docs/tests_and_scoring)は100点開始、まず減点、残りが90点以上のときだけ加点、最低0点と説明する。評点はA+（100以上）、A（90～99）、A-（85～89）、B+（80～84）、B（70～79）、B-（65～69）、C+（60～64）、C（50～59）、C-（45～49）、D+（40～44）、D（30～39）、D-（25～29）、F（0～24）。点数は防御機能採用の目安で、危険性の客観的確率ではない。

取得したMDN本文では「Tests and Score Modifiers」の後の個別表が抽出されなかったため、**現行のMDN公式リポジトリも照合**した。旧`mozilla/http-observatory`の2024年資料は最高点135等の旧情報なので現行表として用いない。[現行のテスト一覧・algorithmVersion=6](https://raw.githubusercontent.com/mdn/mdn-http-observatory/main/src/constants.js)、[採点処理](https://raw.githubusercontent.com/mdn/mdn-http-observatory/main/src/scanner/index.js)、[採点表](https://raw.githubusercontent.com/mdn/mdn-http-observatory/main/src/grader/charts.js)

以下は現行公開`main`の条件別modifierの要約（各行は同一テストの選択結果であり、行内の条件を重複加算しない）。全行確認日2026-10-22、共通根拠は[公式採点表](https://raw.githubusercontent.com/mdn/mdn-http-observatory/main/src/grader/charts.js)。

| テスト | 加点・通常値・減点の概要 |
|---|---|
| CSP | 厳格で`default-src 'none'`:+10、危険設定なし:+5、styleのみ緩い:0。eval／受動資源HTTP:-10、危険なscript/object許可／能動資源HTTP:-20、不在・無効・Report-Onlyのみ:-25。重複ディレクティブ結果:0 |
| Cookie | Secure＋必要なHttpOnly＋SameSite:+5、基本条件充足／未検出:0。Secure不足をHSTS補完:-5（セッション:-10）、一般Secure不足:-20、不正SameSite／CSRF用SameSite不足:-20、セッションHttpOnly不足:-30、セッションSecure不足:-40 |
| CORS | 不使用・公開の非認証アクセス・限定許可:0。資格情報付きの無制限許可:-50 |
| HTTP→HTTPS | 適切な同一ホスト移行／HTTP閉鎖／全経路preloaded:0、HTTPから別ホストへ直接:-5、最初がHTTP転送:-10、HTTPS未到達・転送なし・証明書不正:-20 |
| Referrer-Policy | `no-referrer`・`same-origin`・`strict-origin`・`strict-origin-when-cross-origin`:+5、不在:0、他の緩い値／不正:-5 |
| HSTS | preload収載:+5、max-age≥15768000:0、短い:-10、不在・不正・HTTPS不可・証明書不正:-20 |
| SRI | 安全な読み込み＋SRI:+5、非HTML／scriptなし／同系オリジンのみでSRIなし:0、外部HTTPSでSRIなし:-5、HTTP等でSRIあり:-20、HTTP等でSRIなし:-50 |
| X-Content-Type-Options | `nosniff`:0、不在／不正:-5 |
| X-Frame-Options | CSPのframe-ancestorsあり／DENY／SAMEORIGIN:+5、ALLOW-FROM:0、不在／不正:-20 |
| COOP | `same-origin`／`same-origin-allow-popups`／`noopener-allow-popups`:+10、不在／`unsafe-none`:0、不正:-5 |
| COEP | `require-corp`／`credentialless`:+10、不在／`unsafe-none`:0、不正:-5 |
| CORP | `same-origin`／`same-site`:+10、不在／`cross-origin`:0、不正:-5 |

**現行仕様として公開時に留保する点**：

- MDN文書は最高点145と記載する一方、現行mainの12テストの最大modifierは合計65で、公開処理からの机上合計は165。**稼働サービスのデプロイ版とmainの一致・最高点はunverified**。145を自アプリの固定の満点として採用しない。[文書](https://developer.mozilla.org/en-US/observatory/docs/tests_and_scoring)、[公開採点処理](https://raw.githubusercontent.com/mdn/mdn-http-observatory/main/src/scanner/index.js)
- Cookieの採点説明文にはSameSiteがStrict/Lax以外なら不正という古い記述が残るが、**現行テスト処理は`None; Secure`を不正扱いしない**。実処理はLax/Strict/Noneを認識し、NoneでSecureがない場合に不正結果とする。説明文だけをルールにしない。セッションらしさも名前にlogin/sessを含むか等の推定であり、業務上の意味は確定しない。[公式Cookieテスト](https://raw.githubusercontent.com/mdn/mdn-http-observatory/main/src/analyzer/tests/cookies.js)
- CSP加点説明のform-action要件と処理には差がある。処理はdefault-src等から結果を選び、form-actionの緩さは別フラグにもする。nonce/hash付きstrict-dynamic時には広い許可を実効値から除去する。文字列検索だけで再現しない。[公式CSPテスト](https://raw.githubusercontent.com/mdn/mdn-http-observatory/main/src/analyzer/tests/csp.js)
- XFOテストはframe-ancestorsの存在で代替成立とする処理。`frame-ancestors *`の実効防御まで保証するものではない。ALLOW-FROMの0点・passという互換処理もブラウザ向け推奨とは別。[公式XFOテスト](https://raw.githubusercontent.com/mdn/mdn-http-observatory/main/src/analyzer/tests/x-frame-options.js)

以上から、「リンクの毒見」は**Observatory互換を名乗らず、観測できた防御設定の独自評価**として示すのが妥当。複数取得・Origin操作・Cookie jar・preloadリスト等が前提の全テストを、1回の通常取得だけで同等に再現したとは言えない。

### F-2. ヘッダー別の良い値／弱い値／不足時の影響

全行確認日2026-10-22。値は用途に合わせる。OWASP Secure Headers Projectの提案値をそのまま全応答に適用する意味ではない。[OWASP Best Practicesの提案表](https://secure-headers-project.owasp.org/best-practices/)

| ヘッダー・設定 | 良い値・判断基準 | 弱い値・誤用 | 足りないときの影響／条件 | 根拠URL |
|---|---|---|---|---|
| Strict-Transport-Security | HTTPS上で`max-age=63072000`。全サブドメイン対応済みなら`includeSubDomains`。Mozillaの最低目安15768000秒 | 短いmax-age、`max-age=0`は解除。HTTP応答上では無効 | 学習済みHSTSによるHTTP→HTTPS強制を得られない。初回アクセスはpreloadなしでは別途限界 | [Mozilla Guidelines](https://infosec.mozilla.org/guidelines/web_security#http-strict-transport-security)、[OWASP説明](https://secure-headers-project.owasp.org/response-headers/#strict-transport-security) |
| Content-Security-Policy | 用途に合うnonce/hash中心のscript制限、`object-src 'none'`、`base-uri 'none'`または`'self'`、`frame-ancestors`等 | scriptでunsafe-inline、unsafe-eval、data:、*、広いschemeのみ。Report-Onlyは強制しない | XSS等に対する追加の封じ込めがない。未設定だけでXSS存在は確定しない | [Google公式チェック](https://raw.githubusercontent.com/google/csp-evaluator/master/checks/security_checks.ts)、[W3C CSP3](https://www.w3.org/TR/CSP3/) |
| X-Frame-Options／CSP frame-ancestors | 埋め込み不要なら`DENY`／`frame-ancestors 'none'`。同一オリジンのみなら`SAMEORIGIN`／`'self'` | ALLOW-FROM、frame-ancestorsの無制限許可 | 第三者によるフレーム埋め込みへの制限がなく、重要操作画面ではクリックジャックの防御が欠ける | [OWASP](https://secure-headers-project.owasp.org/response-headers/#x-frame-options)、[CSP3 §6.4.2](https://www.w3.org/TR/CSP3/#directive-frame-ancestors) |
| X-Content-Type-Options | `nosniff`と正しいContent-Type | 不正値、MIME不一致のまま | MIME型の推測を抑える追加防御が欠ける。アップロード配信等では影響が大きくなり得る | [OWASP Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html#x-content-type-options) |
| Set-Cookie Secure | HTTPSのセッション等にはSecure | 欠落、HTTPでの設定 | Cookieが平文HTTPへ送信されるリスク。HSTSは補完でありSecureを省く理由にしない | [MDN Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)、[Mozilla](https://infosec.mozilla.org/guidelines/web_security#cookies) |
| Set-Cookie HttpOnly | JSから読む必要がない認証Cookieに付与 | セッションで欠落 | XSS成立時にJSでCookieを読むことを阻止できない。HttpOnlyでも認証付き操作そのものは防げない | [MDN Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie) |
| Set-Cookie SameSite | 通常は明示Lax、要件次第でStrict。正当なcross-site用途は`None; Secure` | 意味不明な値、NoneでSecureなし。StrictをSSO等へ無条件推奨しない | cross-site送信制限によるCSRF緩和が不足。ただしブラウザ既定値・別のCSRF対策も考慮 | [MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie#samesitesamesite-value) |
| Referrer-Policy | OWASP Projectは`no-referrer`。分析等との両立には`strict-origin-when-cross-origin` | `unsafe-url`、旧既定の`no-referrer-when-downgrade`等 | 設定が緩いと外部宛てにパス・クエリ等を渡す。未設定だけなら現代の既定で緩和済み | [OWASP提案表](https://secure-headers-project.owasp.org/best-practices/)、[MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy)、[OWASP Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html#referrer-policy) |
| Permissions-Policy | 必要な機能だけ許可。例`camera=(), microphone=(), geolocation=()`は使わない場合 | 必要性なく`*`を許可。未対応の指示を大量に並べて有効と思う | 機能・iframeへの委譲制限が既定任せになる。機能ごとの既定・利用者許可は依然存在 | [MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy) |
| COOP | 分離には`same-origin`。OAuth/決済ポップアップは`same-origin-allow-popups`等を検討 | `unsafe-none`は分離なしの既定。全用途にsame-originを強制 | openerとのBrowsing Context Group分離を追加しない。導入で外部ポップアップ連携が切れることがある | [MDN COOP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Opener-Policy) |
| COEP | 強い分離が必要なら`require-corp`、要件に応じ`credentialless` | `unsafe-none`は既定。重複・複数トークン設定も無効相当 | no-corsで読み込む外部資源に許諾を要求する機構がない。導入時は外部画像・script等を止め得る | [MDN COEP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy) |
| CORP | 非公開・同一用途は`same-origin`／`same-site`。CDN等の公開資源なら`cross-origin`が適切な場合あり | 共有不要の機密資源を無制限共有。共有用資源をsame-originにして破壊 | 他オリジンのno-cors読み込みを追加制限しない。CORSとは別の仕組み | [MDN CORP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Resource-Policy) |
| Access-Control-Allow-Origin等 | 認証資源は検証した限定Origin。公開・非認証なら`*`も適切。不使用ならヘッダーなし | Originの無検証反射＋資格情報許可。`*`＋credentialsはブラウザが許さない | 不在は通常same-origin制約の維持であり減点理由にならない | [Mozilla CORS](https://infosec.mozilla.org/guidelines/web_security#cross-origin-resource-sharing)、[Observatoryの現行採点説明](https://raw.githubusercontent.com/mdn/mdn-http-observatory/main/src/grader/charts.js) |
| Cache-Control | 個人情報・認証応答は用途に応じ`no-store` | 機密応答を共有キャッシュ可能にする | 利用端末・中間キャッシュへの残存による漏洩の懸念。公開静的資源にはキャッシュが有用 | [OWASP説明](https://secure-headers-project.owasp.org/response-headers/#cache-control) |
| Server / X-Powered-By / X-AspNet-Version | 不要な具体版情報は抑制 | 詳細な製品・版の公開 | 攻撃対象の推定材料になるが、欠如は安全の証拠でなく、存在だけで高危険判定もしない | [OWASP Best Practices](https://secure-headers-project.owasp.org/best-practices/) |

OWASPのCSP提案値は`default-src 'self'; form-action 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; upgrade-insecure-requests`。これは出発点であり、ユーザーアップロードやJSONPが同じオリジンにある場合の`'self'`の弱さ、アプリごとの必要資源を別途考慮する。全サイトへそのまま貼れば完成とはしない。[OWASP提案](https://secure-headers-project.owasp.org/best-practices/)、[Googleによるselfの条件付き指摘](https://raw.githubusercontent.com/google/csp-evaluator/master/checks/security_checks.ts)

OWASP一覧の`Clear-Site-Data: "cache","cookies","storage"`はログアウト等のデータ消去用途。全ページへ常設する推奨には含めない。`X-Permitted-Cross-Domain-Policies: none`は旧Adobe系ポリシー用、`X-DNS-Prefetch-Control: off`も用途・プライバシー次第で、両者の欠落を主要な実害と同格にしない。[OWASPの各ヘッダー説明](https://secure-headers-project.owasp.org/response-headers/)

### F-3. HSTS・Cookie・ブラウザ既定値の補足

Mozilla Guidelinesの最低6か月（15768000秒）と推奨2年（63072000秒）は**運用指針の目安**。RFC上の有効／無効の境界を6か月とするわけではない。段階導入では短いmax-ageも合理的。`includeSubDomains`はHTTPS未対応の子ドメインを使用不能にし得る。`preload`は付けただけで収載されず、OWASP Projectもデフォルト設定に入れない方針。Mozilla内部のMandatory表記を、全サイトに法的・標準上の必須要件があると読み替えない。[Mozilla](https://infosec.mozilla.org/guidelines/web_security#http-strict-transport-security)、[OWASP HSTS説明](https://secure-headers-project.owasp.org/response-headers/#strict-transport-security)

| Cookie項目 | 確認済みの条件・既定 | 注意・採点への反映 | 根拠URL |
|---|---|---|---|
| `__Secure-` | HTTPSからSecure付きで設定 | HttpOnly・SameSite・Domain制限を自動で意味しない | [MDN Cookie prefixes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie#cookie_prefixes) |
| `__Host-` | HTTPS、Secure、Path=/、Domain属性なし | 他のサブドメインへ広げない。HttpOnly・SameSiteは別途設定。対応ブラウザでの強制 | [MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie#cookie_prefixes) |
| SameSite未指定 | 一部ブラウザではLaxが既定 | 「全ブラウザで必ずLax」はunverified。既定適用のLaxには設定後2分以内のPOSTを送る緩和例がある | [MDN SameSite](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie#samesitesamesite-value) |
| SameSite=None | cross-site送信を許可、Secure必須 | 正当な用途あり。不正値と同一視しない | [MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie#samesitesamesite-value) |
| Domain / Path / 期限 | Domainは必要な場合のみ、範囲・寿命は必要最小限 | Pathは読取権限のセキュリティ境界にはならない。Cookie名からセッション用途を確定しない | [MDN Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)、[Mozilla Cookie指針](https://infosec.mozilla.org/guidelines/web_security#cookies) |

確認日2026-10-22。SameSiteは**same-site**基準であり、same-originと同義ではない。SecureはHTTP送信を抑制、HttpOnlyはJSによる読取を抑制、SameSiteはcross-site送信を制限し、互いに代用できない。HTMLにCookieが見えなくても、ログイン後やJS設定のCookieの安全性は未確認。

### F-4. CSPの弱さは実効ディレクティブで評価

全行確認日2026-10-22。CSP3は取得時点で**2026-09-16 Working Draft**であり、最終勧告済みという扱いはしない。

| 設定 | 弱くなる理由 | 誤判定を避ける条件 | 根拠URL |
|---|---|---|---|
| scriptの`'unsafe-inline'` | 注入したインラインscript・イベント処理等を許し得る | 有効なnonce/hash等がある場合やstrict-dynamicの互換用記述で無視されることがある。style-srcだけの場合と分ける | [MDN script-src](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src)、[Googleチェック](https://raw.githubusercontent.com/google/csp-evaluator/master/checks/security_checks.ts) |
| `'unsafe-eval'` | eval等の文字列をコードに変えるAPIの制限を緩める | 存在だけで攻撃経路の存在を確定しない。nonce/hashはunsafe-evalの許可を無効にしない | [MDN script-src](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src) |
| `data:` | script-src等では任意内容のデータURIをコード源にできる | `img-src data:`まで一律にscript実行と同じ危険度にしない | [Googleチェック](https://raw.githubusercontent.com/google/csp-evaluator/master/checks/security_checks.ts) |
| `*`／`https:`だけ | script/object等で信頼対象を絞れない。TLSで運ばれる攻撃資源も許す | ワイルドカードの対象ディレクティブを確認。CORSの`*`とは別 | [Googleチェック](https://raw.githubusercontent.com/google/csp-evaluator/master/checks/security_checks.ts) |
| `http:` | 暗号化されない経路から資源を許す設定 | CSPの許可とブラウザのmixed-contentブロック／upgradeを区別。「実際にHTTP scriptが実行された」とは言えない | [CSP3 source matching](https://www.w3.org/TR/CSP3/#match-url-to-source-expression)、[Observatory CSPテスト](https://raw.githubusercontent.com/mdn/mdn-http-observatory/main/src/analyzer/tests/csp.js) |
| frame-ancestors欠落 | 埋め込み元の制限を得られない | default-srcへfallbackしない。`frame-src`は自ページが読み込むフレームの制限で別物 | [CSP3 frame-ancestors](https://www.w3.org/TR/CSP3/#directive-frame-ancestors) |
| Report-Only／meta | Report-Onlyは違反を止めない。metaには使えない指示がある | frame-ancestorsはmetaでは無効。HTTPヘッダーの強制ポリシーを調べる | [CSP3配信規則](https://www.w3.org/TR/CSP3/#csp-header)、[meta規則](https://www.w3.org/TR/CSP3/#meta-element) |

強制CSPの`frame-ancestors`があると、対応ブラウザはX-Frame-Optionsよりそちらを優先する。Report-Onlyのframe-ancestorsはこの置換条件を満たさない。CSPとXFOの両方がない場合と、XFOなしだが有効なframe-ancestorsがある場合を区別する。[CSP3 §6.4.2.2](https://www.w3.org/TR/CSP3/#frame-ancestors-and-frame-options)

複数の強制CSPは原則すべて適用されるため、ヘッダーを一つの緩い許可集合として足し合わせない。構文解析・fallback・複数ポリシー・script-src-elem/attrを考慮しない簡易評価なら、その限界を表示する。[CSP3 複数ポリシー](https://www.w3.org/TR/CSP3/#multiple-policies)

### F-5. 非推奨ヘッダー

| ヘッダー | 現在の扱い・理由 | 現在の推奨／欠落の評価 | 根拠URL |
|---|---|---|---|
| X-XSS-Protection | 旧ブラウザのXSSフィルター用。誤動作で別の問題を生む場合がある | 新規に1やmode=blockを勧めない。OWASPは**0で無効化**しCSPを推奨。欠落を減点しない | [OWASP](https://secure-headers-project.owasp.org/response-headers/#x-xss-protection)、[MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-XSS-Protection) |
| Expect-CT | 非推奨。Chromium107から廃止扱い、CTは既定で強制 | 導入を推奨しない。適切な公開証明書の運用を行う。欠落を減点しない | [MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Expect-CT) |
| Public-Key-Pins（HPKP） | 主要ブラウザで廃止。誤ピンや悪用でサイトを使えなくする危険 | 新規導入しない。HSTS・証明書運用は別の役割でありHPKPと同じ機能の代替とは説明しない | [OWASP](https://secure-headers-project.owasp.org/response-headers/#public-key-pins) |
| Feature-Policy | Permissions-Policyに置換。構文も変更 | 必要な機能にPermissions-Policyを使う。旧ヘッダー欠落を減点しない | [OWASP](https://secure-headers-project.owasp.org/response-headers/#feature-policy)、[MDN Permissions-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy) |

全行確認日2026-10-22。古い資料に掲載された「全部のセキュリティヘッダーを追加」の例を現行推奨へ流用しない。

### F-6. 必須ではないヘッダーと、実害への近さ

COOPはウィンドウ関係の分離、COEPは文書の外部資源読み込み条件、CORPは配信する資源側のno-cors共有制限で、相互に別の制御。SharedArrayBuffer等を使うcross-origin isolationではCOOP=`same-origin`とCOEP=`require-corp`または`credentialless`等が必要だが、すべての一般サイトがこの機能を使うわけではない。画像共有、CDN、SSO、決済ポップアップ等との互換性もある。**欠落を一律重大扱いしないという本調査の提案**は、これらの役割・既定動作・導入副作用からの判断であり、「標準が導入を禁止・不要と定める」という主張ではない。[MDN COOP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Opener-Policy)、[COEP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy)、[CORP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Resource-Policy)

Permissions-Policyは機能ごとに`*`／`self`／`none`の既定許可があり、ブラウザ対応にも差がある。欠落だけでカメラ・マイクが無断使用できるとは言えない。Referrer-Policyも現代の既定はstrict-origin-when-cross-originで、欠落だけで全URLの外部流出とは言えない。[MDN Permissions](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy)、[MDN Referrer](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy)

**OWASPが定めた、全サイト共通の「欠落ヘッダー危険順位」はunverified**。以下は出典の被害機序に基づく、アプリ向けの条件付き優先度案。MozillaのBenefit分類はHTTPS・安全な資源読込をMAXIMUM、HSTS・Cookie・CSPをHIGHとするが、実被害の発生確率を数値化したものではない。[MozillaのBenefit表](https://infosec.mozilla.org/guidelines/web_security#web-security-cheat-sheet)、[OWASP HTTP Headers](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html)

| 優先度案 | 条件と所見 | 実害へのつながり／限界 | 根拠URL |
|---|---|---|---|
| 1 | 平文HTTPで認証・機密情報を送る、認証CookieにSecureなし | 盗聴・改ざん・セッション窃取へ直接つながる条件。HTTPS利用とCookieを先に見る。単なるHSTS欠落と同格にしない | [Mozilla HTTPS/Cookie](https://infosec.mozilla.org/guidelines/web_security) |
| 2 | HTTPSサイトのHSTS欠落、未信頼入力を扱うページでCSP不足・認証CookieのHttpOnly不足 | downgradeやXSS成立時の被害を抑える層が不足。入力不備・HTTP到達・既存のpreload等に依存 | [Mozilla HSTS](https://infosec.mozilla.org/guidelines/web_security#http-strict-transport-security)、[MDN Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie) |
| 3 | 操作画面でframe-ancestorsとXFOの両方がない | クリックジャック防御が欠ける。機密操作のない公開文書との重みを変える | [OWASP XFO](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html#x-frame-options) |
| 4 | nosniff不足、Referrerが緩い | アップロード配信・機密クエリがあると重い。コンテンツとブラウザ既定次第で優先度を繰り上げる | [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html)、[MDN Referrer](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy) |
| 5 | Permissions-Policy、COOP/COEP/CORP不足 | 用途別の追加防御・機能要件として案内。一般サイトでは一律重大減点を提案しない | [MDN Permissions](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy)、[MDN COEP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy) |

全行確認日2026-10-22。機密資源に対する無制限の資格情報付きCORSや共有キャッシュ設定など、**危険な設定が観測された場合は「欠落順位」より優先**する。ただし通常の1回取得だけではOrigin反射や認証後資源の共有を実証できない。

### F-7. 1回取得の診断に採用する表示基準

本調査からの提案（2026-10-22）。「良い／弱い／ない」だけでなく、「未観測・適用対象外・unverified」を別に設ける。

- ヘッダーの有無・値・HTML上の版表記は、そのURL・その応答の観測として示す。サイト全体、ログイン後、他URL、異なるUser-Agentの状態へ一般化しない。
- HTTPからの転送経路、Origin反射、TLS詳細、HSTS preload収載、外部scriptの中身・SRIハッシュ一致、JS実行後のCookieは、追加の証拠がない限りunverified。追加リクエストを前提とするObservatory採点の再現には含めない。
- Set-Cookieがない場合は「この応答ではCookie未検出」。セッション安全性が満点とはしない。Cookie値そのものを診断結果へ転載する必要はない。
- HTTPSページの外部資源URLにhttp:が書かれていても、mixed-content防御やアップグレード後の実通信までは未検証。「平文通信を実証」とは表示しない。
- 公開するのは「運営者向けの守りの設定」。詐欺・なりすましの兆候とは評価軸を分け、EOLやヘッダー不足だけで第三者を詐欺と断定しない。

## 不確かな点

以下は**unverified**。推奨ルール・確定的な公表値には採用しない。

| 項目 | 残る不確実性／扱い |
|---|---|
| Apache HTTP Server 2.2のEOLの日 | 公式ページでは2017年12月まで確認。2017-12-31という日付は今回の一次資料で確認できず、表は月精度 |
| nginxの固定EOL期限 | Mainline/Stable/Legacyの分類は確認。全系統の終了日の固定表や「EOLの概念自体がない」という断定は未確認 |
| IIS10→OSの逆引き | 2016/2019/2022等を番号だけで区別できない。Server2025のIIS対応はMicrosoft一次資料で今回未確認。将来の延長契約や個別OSの保守状態もヘッダーでは確認不能 |
| 一部.NETの通常終了日 | 1.1/2.0/4.0等の通常終了とセキュリティ終了の独立区分は全て確認できていない。OS・SP・3.5 SP1構成要素例外を優先 |
| OpenSSLの通常終了境界 | LTS最終年の開始日は方針からの算出。3.4の期限当日について終了時刻・タイムゾーンは未確認。契約延長やOS版の修正状況は別途確認が必要 |
| jQuery 11022の下限 | 上流告知1.2と現行GHSA DB1.12.0が不一致。間の版はこのCVEの自動判定推奨から除外 |
| lodash 8203の4.17.19 | NVDの修正境界4.17.20とGHSAのlodash境界4.17.19が異なる。lodash-esとの区別も必要。この境界版を一律に脆弱／修正済みとしない |
| Observatoryの稼働版 | MDN文書145点とmainの机上165点に相違。Cookie/CSP説明文と処理にも差がある。稼働サービスのデプロイcommitは未確認。上表は確認した公式mainの仕様概要 |
| ブラウザ間の既定値・対応 | SameSite未指定が全ブラウザでLaxである保証、接頭辞やPermissions機能の全バージョン対応は未確認。一律のブラウザ断定には使わない |
| 特定サイトの実際の脆弱性 | ファイル名と内容一致、バックポート、ビルド構成、未信頼入力経路、認証後設定、侵害・詐欺の有無は本資料だけでは未確認 |
| 汎用の実害順位 | OWASP公認の一律ランキングは確認できない。F-6は用途・被害機序に基づく本調査の提案 |

一次情報の優先順位：製品の公式ライフサイクル・上流のアドバイザリ、対象パッケージを明示した現行GHSA、NVDの評価・範囲をそれぞれ区別する。不一致を黙って合成しない。本調査は代表例であり、全脆弱性の網羅や、記載版への更新後に安全である保証を含まない。

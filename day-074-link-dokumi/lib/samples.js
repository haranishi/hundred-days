// ブラウザからfixtureを読まないよう、契約テストで一致を固定した見本を埋め込む。
export const SAMPLES = [
  {
    "id": "lookalike",
    "label": "見本1：公式そっくり（見本・実在しないサイトです）",
    "url": "https://www.amazon.co.jp.account-check.example/signin",
    "trace": {
      "v": 1,
      "ok": true,
      "requested": "https://www.amazon.co.jp.account-check.example/signin",
      "hops": [],
      "final": {
        "url": "https://www.amazon.co.jp.account-check.example/signin",
        "host": "www.amazon.co.jp.account-check.example",
        "scheme": "https",
        "status": 200,
        "contentType": "text/html; charset=utf-8",
        "contentLength": null,
        "kind": "html",
        "download": null,
        "headers": {
          "server": "nginx",
          "content-type": "text/html; charset=utf-8"
        },
        "cookies": [
          {
            "name": "PHPSESSID",
            "secure": false,
            "httpOnly": false,
            "sameSite": null,
            "hasDomain": false,
            "path": "/",
            "persistent": false,
            "prefix": null
          }
        ],
        "ms": 180,
        "bytesRead": 18420,
        "truncated": false
      },
      "html": {
        "title": "Amazonサインイン",
        "h1": "ログイン",
        "siteName": null,
        "lang": "ja",
        "generator": null,
        "textSample": "Amazonアカウントの確認が必要です。24時間以内にログインしてください。",
        "metaRefresh": null,
        "baseHref": null,
        "forms": [
          {
            "method": "post",
            "action": "https://collect-1337.example/post.php",
            "actionHost": "collect-1337.example",
            "hasPassword": true,
            "hasEmail": true,
            "hasCardLike": false,
            "hasFileUpload": false,
            "fieldCount": 3,
            "hidden": 2
          }
        ],
        "passwordFields": 1,
        "scripts": {
          "total": 3,
          "inline": 2,
          "external": [
            {
              "src": "https://cdn.example/jq.js",
              "host": "cdn.example",
              "scheme": "https",
              "sri": false,
              "async": false,
              "defer": false,
              "module": false
            }
          ]
        },
        "styles": {
          "total": 0,
          "inline": 0,
          "external": []
        },
        "iframes": [
          {
            "src": "https://trk.example/p",
            "host": "trk.example",
            "scheme": "https",
            "hidden": true,
            "sandbox": false
          }
        ],
        "images": {
          "total": 4,
          "http": 0
        },
        "links": {
          "total": 5,
          "external": 2,
          "externalHosts": [
            "www.amazon.co.jp"
          ],
          "http": 0
        },
        "signals": {
          "directoryListing": false,
          "defaultPage": null,
          "errorDisclosure": null,
          "obfuscation": [
            "eval-atob"
          ],
          "autoSubmit": false,
          "noindex": true,
          "metaReferrer": null,
          "metaCsp": false
        },
        "truncated": false
      },
      "error": null,
      "notes": [],
      "elapsedMs": 420
    },
    "around": {
      "v": 1,
      "host": "www.amazon.co.jp.account-check.example",
      "registrable": "account-check.example",
      "scheme": "https",
      "dns": {
        "a": [
          "198.51.100.7"
        ],
        "aaaa": [],
        "resolvedPublic": true,
        "dnssec": false,
        "caa": false,
        "mx": false,
        "spf": {
          "present": false,
          "all": null,
          "value": null
        },
        "dmarc": {
          "present": false,
          "policy": null,
          "value": null
        }
      },
      "rdap": {
        "registeredAt": "2026-10-19T00:00:00Z",
        "expiresAt": "2027-10-19T00:00:00Z",
        "ageDays": 3,
        "registrar": "Cheap Registrar",
        "source": "rdap.org"
      },
      "httpProbe": {
        "tested": true,
        "status": 200,
        "location": null,
        "upgradesToHttps": false
      },
      "httpsProbe": {
        "tested": false
      },
      "securityTxt": {
        "found": false,
        "status": 404,
        "hasContact": false,
        "expires": null,
        "expired": false
      },
      "error": null,
      "elapsedMs": 540
    }
  },
  {
    "id": "clean",
    "label": "見本2：しっかりしたサイト（見本・実在しないサイトです）",
    "url": "https://www.well-kept.example/",
    "trace": {
      "v": 1,
      "ok": true,
      "requested": "https://www.well-kept.example/",
      "hops": [],
      "final": {
        "url": "https://www.well-kept.example/",
        "host": "www.well-kept.example",
        "scheme": "https",
        "status": 200,
        "contentType": "text/html; charset=utf-8",
        "contentLength": null,
        "kind": "html",
        "download": null,
        "headers": {
          "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
          "content-security-policy": "default-src 'self'; script-src 'self' 'nonce-r4nd0m'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
          "x-frame-options": "DENY",
          "x-content-type-options": "nosniff",
          "referrer-policy": "strict-origin-when-cross-origin",
          "permissions-policy": "camera=(), microphone=()",
          "cross-origin-opener-policy": "same-origin",
          "content-type": "text/html; charset=utf-8",
          "server": "cloudflare",
          "cache-control": "no-cache"
        },
        "cookies": [
          {
            "name": "__Host-session",
            "secure": true,
            "httpOnly": true,
            "sameSite": "lax",
            "hasDomain": false,
            "path": "/",
            "persistent": false,
            "prefix": "__Host-"
          }
        ],
        "ms": 180,
        "bytesRead": 18420,
        "truncated": false
      },
      "html": {
        "title": "ようこそ — 見本の店",
        "h1": "季節の菓子と茶",
        "siteName": "見本の店",
        "lang": "ja",
        "generator": null,
        "textSample": "季節の菓子と茶 ご注文はこちら 営業時間 10時から18時",
        "metaRefresh": null,
        "baseHref": null,
        "forms": [
          {
            "method": "get",
            "action": "/search",
            "actionHost": null,
            "hasPassword": false,
            "hasEmail": false,
            "hasCardLike": false,
            "hasFileUpload": false,
            "fieldCount": 1,
            "hidden": 0
          }
        ],
        "passwordFields": 0,
        "scripts": {
          "total": 1,
          "inline": 0,
          "external": [
            {
              "src": "./assets/app.js",
              "host": null,
              "scheme": "relative",
              "sri": false,
              "async": false,
              "defer": true,
              "module": true
            }
          ]
        },
        "styles": {
          "total": 1,
          "inline": 0,
          "external": [
            {
              "href": "./assets/app.css",
              "host": null,
              "scheme": "relative",
              "sri": false
            }
          ]
        },
        "iframes": [],
        "images": {
          "total": 6,
          "http": 0
        },
        "links": {
          "total": 14,
          "external": 1,
          "externalHosts": [
            "www.instagram.com"
          ],
          "http": 0
        },
        "signals": {
          "directoryListing": false,
          "defaultPage": null,
          "errorDisclosure": null,
          "obfuscation": [],
          "autoSubmit": false,
          "noindex": false,
          "metaReferrer": null,
          "metaCsp": false
        },
        "truncated": false
      },
      "error": null,
      "notes": [],
      "elapsedMs": 420
    },
    "around": {
      "v": 1,
      "host": "www.well-kept.example",
      "registrable": "well-kept.example",
      "scheme": "https",
      "dns": {
        "a": [
          "203.0.113.10"
        ],
        "aaaa": [],
        "resolvedPublic": true,
        "dnssec": true,
        "caa": true,
        "mx": true,
        "spf": {
          "present": true,
          "all": "-all",
          "value": "v=spf1 include:_spf.mail.example -all"
        },
        "dmarc": {
          "present": true,
          "policy": "reject",
          "value": "v=DMARC1; p=reject; rua=mailto:dmarc@well-kept.example"
        }
      },
      "rdap": {
        "registeredAt": "2009-03-12T00:00:00Z",
        "expiresAt": "2027-03-12T00:00:00Z",
        "ageDays": 6400,
        "registrar": "Example Registrar",
        "source": "verisign"
      },
      "httpProbe": {
        "tested": true,
        "status": 301,
        "location": "https://www.well-kept.example/",
        "upgradesToHttps": true
      },
      "httpsProbe": {
        "tested": false
      },
      "securityTxt": {
        "found": true,
        "status": 200,
        "hasContact": true,
        "expires": "2027-06-30T00:00:00Z",
        "expired": false
      },
      "error": null,
      "elapsedMs": 610
    }
  },
  {
    "id": "legacy",
    "label": "見本3：守りの弱いサイト（見本・実在しないサイトです）",
    "url": "http://old-shop.example/",
    "trace": {
      "v": 1,
      "ok": true,
      "requested": "http://old-shop.example/",
      "hops": [],
      "final": {
        "url": "http://old-shop.example/",
        "host": "old-shop.example",
        "scheme": "http",
        "status": 200,
        "contentType": "text/html; charset=utf-8",
        "contentLength": null,
        "kind": "html",
        "download": null,
        "headers": {
          "server": "Apache/2.2.15 (CentOS)",
          "x-powered-by": "PHP/5.6.40",
          "content-type": "text/html"
        },
        "cookies": [
          {
            "name": "PHPSESSID",
            "secure": false,
            "httpOnly": false,
            "sameSite": null,
            "hasDomain": false,
            "path": "/",
            "persistent": false,
            "prefix": null
          }
        ],
        "ms": 180,
        "bytesRead": 18420,
        "truncated": false
      },
      "html": {
        "title": "見本商店 — 通信販売",
        "h1": "見本商店",
        "siteName": null,
        "lang": "ja",
        "generator": "WordPress 4.9.8",
        "textSample": "ログイン 新規会員登録 カート",
        "metaRefresh": null,
        "baseHref": null,
        "forms": [
          {
            "method": "post",
            "action": "http://old-shop.example/login.php",
            "actionHost": "old-shop.example",
            "hasPassword": true,
            "hasEmail": true,
            "hasCardLike": false,
            "hasFileUpload": false,
            "fieldCount": 2,
            "hidden": 0
          }
        ],
        "passwordFields": 1,
        "scripts": {
          "total": 3,
          "inline": 1,
          "external": [
            {
              "src": "http://old-shop.example/js/jquery-1.12.4.min.js",
              "host": "old-shop.example",
              "scheme": "http",
              "sri": false,
              "async": false,
              "defer": false,
              "module": false
            },
            {
              "src": "https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/js/bootstrap.min.js",
              "host": "maxcdn.bootstrapcdn.com",
              "scheme": "https",
              "sri": false,
              "async": false,
              "defer": false,
              "module": false
            }
          ]
        },
        "styles": {
          "total": 1,
          "inline": 0,
          "external": [
            {
              "href": "http://old-shop.example/css/style.css",
              "host": "old-shop.example",
              "scheme": "http",
              "sri": false
            }
          ]
        },
        "iframes": [],
        "images": {
          "total": 10,
          "http": 3
        },
        "links": {
          "total": 22,
          "external": 1,
          "externalHosts": [
            "twitter.com"
          ],
          "http": 20
        },
        "signals": {
          "directoryListing": false,
          "defaultPage": null,
          "errorDisclosure": "php",
          "obfuscation": [],
          "autoSubmit": false,
          "noindex": false,
          "metaReferrer": null,
          "metaCsp": false
        },
        "truncated": false
      },
      "error": null,
      "notes": [],
      "elapsedMs": 420
    },
    "around": {
      "v": 1,
      "host": "old-shop.example",
      "registrable": "old-shop.example",
      "scheme": "http",
      "dns": {
        "a": [
          "192.0.2.55"
        ],
        "aaaa": [],
        "resolvedPublic": true,
        "dnssec": false,
        "caa": false,
        "mx": true,
        "spf": {
          "present": false,
          "all": null,
          "value": null
        },
        "dmarc": {
          "present": false,
          "policy": null,
          "value": null
        }
      },
      "rdap": {
        "unavailable": "unsupported"
      },
      "httpProbe": {
        "tested": false,
        "reason": "final_is_http"
      },
      "httpsProbe": {
        "tested": true,
        "reachable": false,
        "status": null,
        "error": "connect_failed"
      },
      "securityTxt": {
        "found": false,
        "status": 404,
        "hasContact": false,
        "expires": null,
        "expired": false
      },
      "error": null,
      "elapsedMs": 700
    }
  }
];

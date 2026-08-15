import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

// record-demo.mjs は file:// でページを開くが、このアプリはESモジュール＋fetchを使うため
// file:// ではCORSで動かない。振り付け内でローカルHTTPサーバーを立てて開き直す。
const appDir = dirname(fileURLToPath(import.meta.url));
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
};
let baseUrl = null;

async function ensureServer() {
  if (baseUrl) return baseUrl;
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (path.endsWith("/")) path += "index.html";
      const body = await readFile(join(appDir, path));
      res.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream" }).end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  server.unref();
  baseUrl = `http://127.0.0.1:${server.address().port}/`;
  return baseUrl;
}

async function prepareTokyo(page) {
  const base = await ensureServer();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition(success) {
          success({ coords: { latitude: 35.6812, longitude: 139.7671, accuracy: 10 } });
        },
      },
    });
  });
  await page.goto(base, { waitUntil: "load" });
}

export async function shotSetup(page) {
  await prepareTokyo(page);
  await page.click("#locate-button");
  await page.waitForSelector("#results:not([hidden])");
  await page.evaluate(() => document.querySelector("#results").scrollIntoView({ block: "start" }));
  await page.click(".result-select");
  await page.waitForTimeout(350);
}

export const shotScroll = 0;

export default async function (page, h) {
  await prepareTokyo(page);
  await h.pause(1800);
  await page.click("#locate-button");
  await page.waitForSelector("#results:not([hidden])");
  await h.pause(5200);
  await h.scrollTo("#result-list", 900);
  await page.click(".result-select");
  await h.pause(4800);
  await h.scrollTo(".radar-panel", 800);
  await h.pause(2400);
}

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { onRequestGet } from "../../functions/api/day-023/trend.js";

const appDir = dirname(fileURLToPath(import.meta.url));
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8" };
let baseUrl = null;

async function ensureServer() {
  if (baseUrl) return baseUrl;
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url, "http://local");
      if (requestUrl.pathname === "/api/day-023/trend") {
        const result = await onRequestGet({ request: new Request(requestUrl) });
        response.writeHead(result.status, Object.fromEntries(result.headers)).end(Buffer.from(await result.arrayBuffer()));
        return;
      }
      let path = decodeURIComponent(requestUrl.pathname);
      if (path.endsWith("/")) path += "index.html";
      const body = await readFile(join(appDir, path));
      response.writeHead(200, { "content-type": MIME[extname(path)] || "application/octet-stream" }).end(body);
    } catch {
      response.writeHead(404).end("not found");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  server.unref();
  baseUrl = `http://127.0.0.1:${server.address().port}/`;
  return baseUrl;
}

async function prepare(page) {
  await page.goto(await ensureServer(), { waitUntil: "load" });
}

async function search(page, query) {
  const input = page.locator("#view-home").isVisible().then((visible) => visible ? "#q" : "#q-again");
  await page.locator(await input).fill(query);
  await page.locator(await input).press("Enter");
  await page.locator("#analysis-content").waitFor({ state: "visible", timeout: 45_000 });
}

export default async function demo(page, h) {
  await prepare(page);
  await h.pause(400);
  await search(page, "推し活");
  await h.pause(2400);
  await h.scrollTo(".trend-card");
  await h.pause(2200);
  await page.getByRole("button", { name: "表で見る" }).click();
  await h.pause(2000);
  await h.scrollTo("#records-title");
  await h.pause(2000);
  await h.scrollTo(".again-band");
  await search(page, "サウナ");
  await h.scrollTo(".trend-card");
  await h.pause(2800);
}

export const shotScroll = 0;
export async function shotSetup(page) {
  await prepare(page);
  await search(page, "推し活");
  await page.locator(".trend-card").evaluate((target) => {
    window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - 24, behavior: "instant" });
  });
  await page.waitForTimeout(300);
}

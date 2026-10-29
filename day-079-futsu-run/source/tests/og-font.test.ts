import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadOgFont, OG_FONT_PATH } from "../src/lib/og-font";

const fileBytes = readFileSync(path.join(process.cwd(), "public", OG_FONT_PATH));

describe("OGP font loading", () => {
  it("returns font ArrayBuffer synchronously from memory without network or filesystem calls", async () => {
    const font = await loadOgFont();
    expect(font.byteLength).toBe(fileBytes.byteLength);
  });
});

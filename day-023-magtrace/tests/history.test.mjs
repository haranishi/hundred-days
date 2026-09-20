import test from "node:test";
import assert from "node:assert/strict";
import { STORAGE_NAME, canUseStorage, clearHistory, readHistory, saveHistory } from "../lib/history.js";

const memoryStorage = () => {
  const values = new Map();
  return { getItem: (name) => values.get(name) ?? null, setItem: (name, value) => values.set(name, value), removeItem: (name) => values.delete(name) };
};

test("追加は新しい順、重複なし、最大5件", () => {
  const storage = memoryStorage();
  for (const value of ["A", "B", "C", "D", "E", "F"]) saveHistory(value, storage);
  assert.deepEqual(readHistory(storage), ["F", "E", "D", "C", "B"]);
  assert.deepEqual(saveHistory("D", storage), ["D", "F", "E", "C", "B"]);
  assert.ok(storage.getItem(STORAGE_NAME));
});

test("履歴を1回で消去する", () => {
  const storage = memoryStorage();
  saveHistory("推し活", storage);
  assert.equal(clearHistory(storage), true);
  assert.deepEqual(readHistory(storage), []);
});

test("ストレージ不可でも例外を出さない", () => {
  const storage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
  assert.deepEqual(readHistory(storage), []);
  assert.deepEqual(saveHistory("推し活", storage), []);
  assert.equal(clearHistory(storage), false);
  assert.equal(canUseStorage(storage), false);
});

test("localStorage自体のgetterが例外でも使えない判定にする", () => {
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("blocked"); } });
  try {
    assert.equal(canUseStorage(), false);
    assert.deepEqual(readHistory(), []);
    assert.deepEqual(saveHistory("推し活"), []);
    assert.equal(clearHistory(), false);
  } finally {
    delete globalThis.localStorage;
  }
});

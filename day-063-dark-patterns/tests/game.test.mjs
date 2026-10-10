import test from "node:test";
import assert from "node:assert/strict";
import { STAGES, calculateRank } from "../lib/stages.js";

test("STAGES contains 5 distinct stages with required fields", () => {
  assert.equal(STAGES.length, 5);
  STAGES.forEach((stage, idx) => {
    assert.equal(stage.id, idx + 1);
    assert.ok(stage.title, "Stage has title");
    assert.ok(stage.category, "Stage has category");
    assert.ok(stage.scenario, "Stage has scenario");
    assert.ok(stage.darkPatternName, "Stage has darkPatternName");
    assert.ok(stage.explanation, "Stage has explanation");
    assert.ok(stage.legalNote, "Stage has legalNote");
    assert.ok(Array.isArray(stage.traps), "Stage has traps array");
    assert.ok(stage.timeLimit > 0, "Stage has positive timeLimit");
  });
});

test("calculateRank gives rank S for 0 damage and fast time", () => {
  const result = calculateRank(0, 30);
  assert.equal(result.rank, "S");
  assert.ok(result.title.includes("特務UI捜査官"));
});

test("calculateRank gives rank A for 0 damage and slower time", () => {
  const result = calculateRank(0, 60);
  assert.equal(result.rank, "A");
  assert.ok(result.title.includes("敏腕リテラシー捜査官"));
});

test("calculateRank gives rank B for minor damage", () => {
  const result = calculateRank(4980, 40);
  assert.equal(result.rank, "B");
  assert.ok(result.title.includes("一般ネット市民"));
});

test("calculateRank gives rank C for medium damage", () => {
  const result = calculateRank(12000, 50);
  assert.equal(result.rank, "C");
  assert.ok(result.title.includes("要注意カモ予備軍"));
});

test("calculateRank gives rank D for heavy damage", () => {
  const result = calculateRank(25000, 50);
  assert.equal(result.rank, "D");
  assert.ok(result.title.includes("プラチナ上客"));
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { dayNumber, handle, wordOf, WORDS, type Game, type Judge } from "../src/game.ts";

const DAY1 = Date.UTC(2026, 9, 22, 15); // 2026-10-23 00:00 KST
const DAY = 86_400_000;
const no: Judge = async () => ({ correct: 0, yes: 0 });
const yes: Judge = async () => ({ correct: 0, yes: 0.9 });
const maybe: Judge = async () => ({ correct: 0, yes: 0.5 });
const hit: Judge = async () => ({ correct: 0.95, yes: 0.9 });
const boom: Judge = async () => { throw new Error("timeout"); };

async function start(text = "시작", now = DAY1): Promise<Game> {
  const r = await handle(undefined, text, no, now);
  assert.ok(r.game);
  return r.game;
}

test("dayNumber counts KST days from 2026-10-23", () => {
  assert.equal(dayNumber(DAY1), 1);
  assert.equal(dayNumber(DAY1 - 1), 0);
  assert.equal(dayNumber(DAY1 + DAY - 1), 1);
  assert.equal(dayNumber(DAY1 + DAY), 2);
});

test("wordOf is deterministic and does not repeat within WORDS.length days", () => {
  assert.equal(wordOf(5), wordOf(5));
  const seen = new Set(Array.from({ length: WORDS.length }, (_, i) => wordOf(i + 1)));
  assert.equal(seen.size, WORDS.length);
});

test("시작 uses today's word and 5 고개 by default; 시작 N clamps to 1..20", async () => {
  const g = await start();
  assert.deepEqual(g, { day: 1, secret: wordOf(1), left: 5, total: 5, over: false });
  assert.equal((await start("시작 10")).total, 10);
  assert.equal((await start("/시작 99")).total, 20);
  assert.equal((await start("시작 0")).total, 1);
  assert.equal((await start("시작", DAY1 + DAY)).secret, wordOf(2));
});

test("questions answer 예/아니오/글쎄요 and spend one 고개 each", async () => {
  const g = await start();
  assert.match((await handle(g, "동물이야?", yes, DAY1)).text, /예/);
  assert.match((await handle(g, "먹을 수 있어?", no, DAY1)).text, /아니오/);
  const r = await handle(g, "커?", maybe, DAY1);
  assert.match(r.text, /글쎄요/);
  assert.match(r.text, /2\/5/);
  assert.equal(g.left, 2);
  assert.equal(r.game, undefined); // in-place update, nothing new to store
});

test("correct guess wins and ends the game", async () => {
  const g = await start();
  const r = await handle(g, "사과야?", hit, DAY1);
  assert.match(r.text, /정답/);
  assert.ok(r.text.includes(g.secret));
  assert.equal(g.over, true);
});

test("running out of 고개 reveals the answer", async () => {
  const g = await start("시작 1");
  const r = await handle(g, "동물이야?", no, DAY1);
  assert.equal(g.over, true);
  assert.ok(r.text.includes(g.secret));
});

test("포기 reveals the answer; finished day refuses 시작 until tomorrow", async () => {
  const g = await start();
  assert.ok((await handle(g, "포기", no, DAY1)).text.includes(g.secret));
  const again = await handle(g, "시작", no, DAY1);
  assert.equal(again.game, undefined);
  assert.match(again.text, /#1.*끝났/);
  const tomorrow = await handle(g, "시작", no, DAY1 + DAY);
  assert.equal(tomorrow.game?.day, 2);
});

test("시작 during a running game keeps it", async () => {
  const g = await start();
  await handle(g, "동물이야?", no, DAY1);
  const r = await handle(g, "시작", no, DAY1);
  assert.equal(r.game, undefined);
  assert.equal(g.left, 4);
});

test("no game, finished game, or yesterday's game: questions do not call judge", async () => {
  assert.match((await handle(undefined, "동물이야?", boom, DAY1)).text, /시작/);
  const g = await start();
  g.over = true;
  assert.match((await handle(g, "동물이야?", boom, DAY1)).text, /시작|끝났/);
  const old = await start();
  assert.match((await handle(old, "동물이야?", boom, DAY1 + DAY)).text, /새 문제/);
});

test("judge failure keeps the 고개", async () => {
  const g = await start();
  const r = await handle(g, "동물이야?", boom, DAY1);
  assert.match(r.text, /잠시 후/);
  assert.equal(g.left, 5);
});

test("concurrent questions: one that lands after the game ended is not counted", async () => {
  const g = await start("시작 1");
  const [a, b] = await Promise.all([handle(g, "사과야?", hit, DAY1), handle(g, "동물이야?", no, DAY1)]);
  assert.match(a.text, /정답/);
  assert.match(b.text, /끝났/);
  assert.equal(g.left, 0);
});

test("particles follow the final consonant of the answer", async () => {
  const g = (secret: string): Game => ({ day: 1, secret, left: 5, total: 5, over: false });
  assert.match((await handle(g("책"), "포기", no, DAY1)).text, /'책'이었어요/);
  assert.match((await handle(g("사과"), "포기", no, DAY1)).text, /'사과'였어요/);
  assert.match((await handle(g("책"), "책?", hit, DAY1)).text, /'책'을/);
  assert.match((await handle(g("사과"), "사과?", hit, DAY1)).text, /'사과'를/);
});

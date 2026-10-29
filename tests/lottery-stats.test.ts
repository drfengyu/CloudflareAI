import assert from "node:assert/strict";
import { test } from "node:test";
import {
  consumedTicketsDelta,
  drawStatsDelta,
  mergeStatsDeltas,
  negateStatsDelta,
  ticketStatsDelta,
} from "../lib/lottery/stats";

const t0 = new Date("2026-10-29T01:00:00.000Z");
const t1 = new Date("2026-10-29T01:00:01.000Z");

test("drawStatsDelta aggregates a batch the same way the old SQL did", () => {
  const delta = drawStatsDelta([
    { ring: "inner", deltaCredits: -50, ticketCredits: 200, createdAt: t0 },
    { ring: "outer", deltaCredits: 400, ticketCredits: 200, createdAt: t0 },
    { ring: "outer", deltaCredits: 0, ticketCredits: 200, createdAt: t1 },
    { ring: "inner", deltaCredits: 0, ticketCredits: 0, createdAt: t0 },
  ]);

  assert.equal(delta.draws, 4);
  assert.equal(delta.outerHits, 2);
  assert.equal(delta.paidOut, 400);
  assert.equal(delta.clawedBack, 50);
  assert.equal(delta.ticketFace, 600);
  assert.equal(delta.lastDrawAt?.getTime(), t1.getTime());
});

test("drawStatsDelta rounds money and keeps free draws at zero face", () => {
  const delta = drawStatsDelta([
    { ring: "inner", deltaCredits: 0.1, ticketCredits: 0, createdAt: t0 },
    { ring: "inner", deltaCredits: 0.2, ticketCredits: 0, createdAt: t0 },
  ]);
  assert.equal(delta.paidOut, 0.3);
  assert.equal(delta.ticketFace, 0);
  assert.equal(delta.clawedBack, 0);
});

test("ticketStatsDelta counts buys as unused, gifts and prizes by count only", () => {
  assert.deepEqual(ticketStatsDelta({ source: "buy", count: 3, priceCredits: 200 }), {
    boughtTickets: 3,
    boughtCredits: 600,
    unusedTickets: 3,
    unusedCredits: 600,
  });
  assert.deepEqual(ticketStatsDelta({ source: "gift", count: 2, priceCredits: 0 }), { giftTickets: 2 });
  assert.deepEqual(ticketStatsDelta({ source: "prize", count: 1 }), { prizeTickets: 1 });
  assert.deepEqual(ticketStatsDelta({ source: "buy", count: 0, priceCredits: 200 }), {});
});

test("consumedTicketsDelta only subtracts the unused bucket of bought tickets", () => {
  assert.deepEqual(consumedTicketsDelta(2, 400), { unusedTickets: -2, unusedCredits: -400 });
  assert.deepEqual(consumedTicketsDelta(0, 0), {});
});

test("mergeStatsDeltas adds numeric fields and keeps the latest draw time", () => {
  const merged = mergeStatsDeltas(
    { unusedTickets: -2, unusedCredits: -400, lastDrawAt: t1 },
    { giftTickets: 1, prizeTickets: 2, lastDrawAt: t0 },
  );
  assert.deepEqual(merged, {
    unusedTickets: -2,
    unusedCredits: -400,
    giftTickets: 1,
    prizeTickets: 2,
    lastDrawAt: t1,
  });
});

test("negateStatsDelta reverses every counter and drops the draw time", () => {
  const delta = drawStatsDelta([
    { ring: "outer", deltaCredits: 120, ticketCredits: 200, createdAt: t0 },
  ]);
  const negated = negateStatsDelta(delta);
  assert.equal(negated.draws, -1);
  assert.equal(negated.outerHits, -1);
  assert.equal(negated.paidOut, -120);
  assert.equal(negated.ticketFace, -200);
  assert.equal(negated.lastDrawAt, undefined);
});

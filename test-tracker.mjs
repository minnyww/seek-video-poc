// เทส core logic ของ WatchTracker (ตัวเดียวกับที่ react-player ใช้) กับ fake video
// รันด้วย: npm test  หรือ  node test-tracker.mjs
import assert from "node:assert/strict";
import { WatchTracker } from "./src/lib/WatchTracker.js";

globalThis.document = { addEventListener() {} }; // stub ให้ visibilitychange ผ่าน

class FakeVideo extends EventTarget {
  constructor(duration) {
    super();
    this.duration = duration;
    this.currentTime = 0;
    this.paused = true;
    this.ended = false;
    this.playbackRate = 1;
  }
  play() { this.paused = false; this.dispatchEvent(new Event("play")); }
  pause() { this.paused = true; this.dispatchEvent(new Event("pause")); }
  seek(t) { this.currentTime = t; this.dispatchEvent(new Event("seeking")); this.dispatchEvent(new Event("seeked")); }
  tick(dt) { this.currentTime += dt; this.dispatchEvent(new Event("timeupdate")); }
  watch(from, to, step = 1) { if (this.paused) throw new Error("not playing"); while (this.currentTime < to) this.tick(Math.min(step, to - this.currentTime)); }
}

// ── Scenario ตามตัวอย่างในโจทย์: คลิป 10 นาที ─────────────────────────
// ดู 0:00→2:00, กรอไป 5:00→6:00, กรอกลับ 1:00→3:00 → ต้องได้ unique = 4:00
{
  const v = new FakeVideo(600);
  const t = new WatchTracker(v);

  v.play(); v.watch(0, 120);
  v.seek(300); v.watch(300, 360);
  v.seek(60); v.watch(60, 180);
  v.pause();

  const p = t.getProgress();
  assert.equal(p.watchedSeconds, 240, "unique ต้องเท่ากับ 240 วินาที (4 นาที)");
  assert.deepEqual(p.intervals, [[0, 180], [300, 360]]);
  assert.equal(t.firstUnwatched(), 180, "จุดแรกที่ยังไม่ดูคือ 180");
  assert.ok(!p.completed);
  console.log("✓ scenario ตามโจทย์: unique =", p.watchedSeconds, "s, intervals =", JSON.stringify(p.intervals));
}

// ── ดูซ้ำ 10 รอบ ต้องยังเป็น 1 นาที ────────────────────────────────────
{
  const v = new FakeVideo(600);
  const t = new WatchTracker(v);
  v.play();
  for (let i = 0; i < 10; i++) { v.seek(60); v.watch(60, 120); }
  v.pause();
  const p = t.getProgress();
  assert.equal(p.watchedSeconds, 60, "ดูช่วง 1:00–2:00 สิบรอบ ต้องนับแค่ 60 วิ");
  assert.ok(p.totalPlayedSeconds >= 590, "แต่เวลาเล่นรวมต้องนับทุกรอบ (~600s)");
  console.log("✓ ดูซ้ำ 10 รอบ: unique =", p.watchedSeconds, "s, เวลาเล่นรวม =", p.totalPlayedSeconds, "s");
}

// ── เปิดทิ้งไว้เฉยๆ (ไม่มี timeupdate) แล้ว pause → ไม่นับ ────────────────
{
  const v = new FakeVideo(600);
  const t = new WatchTracker(v);
  v.play(); v.tick(1); v.currentTime = 500; // จำลอง: เล่น 1 วิ แล้วเวลาโดนกระโดดโดยไม่มี event
  v.pause();
  assert.equal(t.getProgress().watchedSeconds, 1);
  console.log("✓ เวลากระโดดโดยไม่มีการเล่นจริง ไม่ถูกนับ");
}

// ── จำกัด playbackRate ────────────────────────────────────────────────
{
  const v = new FakeVideo(600);
  const t = new WatchTracker(v);
  v.playbackRate = 4;
  v.dispatchEvent(new Event("ratechange"));
  assert.equal(v.playbackRate, 2, "rate > 2 ต้องถูกบังคับลง 2");
  console.log("✓ ตั้ง 4x ถูกจำกัดเหลือ 2x");
}

// ── เกณฑ์ครบ 99% → completed ──────────────────────────────────────────
{
  const v = new FakeVideo(600);
  const t = new WatchTracker(v);
  v.play();
  v.watch(0, 580); // 96.7% < 99% ยังไม่ผ่าน
  v.pause();
  assert.ok(!t.getProgress().completed, "580/600 = 96.7% ต้องยังไม่ completed (เกณฑ์ 99%)");
  assert.equal(t.firstUnwatched(), 580, "ช่วง 580–600 ยังไม่ได้ดู");

  v.play(); v.watch(580, 595); v.pause(); // 595/600 = 99.17% ≥ 99%
  assert.ok(t.getProgress().completed, "595/600 = 99.2% ต้อง completed");

  v.play(); v.watch(595, 600); v.pause(); // ดูจนจบทุกวินาที
  assert.equal(t.firstUnwatched(), null);
  console.log("✓ เกณฑ์ 99%: 96.7% ไม่ผ่าน / 99.2% ผ่าน / ดูครบทุกวินาที → firstUnwatched = null");
}

console.log("\nผ่านทั้งหมด 🎉");

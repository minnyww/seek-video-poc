export const fmt = (s) => {
  if (s == null || !isFinite(s)) return "--:--";
  s = Math.max(0, Math.round(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * WatchTracker — วัด "ดูจริง" จากช่วงที่เคยเล่น (unique intervals)
 * ผูกกับ HTMLVideoElement ตัวจริง (จาก react-player: getInternalPlayer())
 *
 * ทำไมไม่ใช้ Set ของ Math.floor(currentTime) ตอน timeupdate:
 * timeupdate ถูก throttle (~4Hz, และหนักมากเมื่อแท็บอยู่เบื้องหลัง)
 * วินาทีที่ไม่มี event หลุดไปเลย — วิธี interval สร้าง [start, end]
 * จาก event play/seeked แล้วปิดด้วย pause/seeking/ended จึงไม่มีวินาทีหลุด
 */
export class WatchTracker {
  constructor(video, { completionThreshold = 0.99, maxRate = 2, minSegment = 0.3 } = {}) {
    this.video = video;
    this.opts = { completionThreshold, maxRate, minSegment };
    this.intervals = [];       // merged & sorted: [[start, end], ...]
    this.segmentStart = null;  // ช่วงที่กำลังเล่น (ยังไม่ปิด)
    this.lastPlayingTime = null; // ตำแหน่งล่าสุดที่เล่นจริง (timeupdate)
    this.pendingSeekFrom = null;
    this.totalPlayedTime = 0;  // เวลาเล่นรวม รวมดูซ้ำ (ไม่นับช่วง seek กระโดด)
    this.completed = false;
    this.onChange = null;      // callback ให้ UI render
    this.onLog = null;         // callback สำหรับ log
    this._bindings = [];       // [target, event, fn] สำหรับถอด listener ตอน destroy()

    const on = (target, ev, fn) => {
      target.addEventListener(ev, fn);
      this._bindings.push([target, ev, fn]);
    };

    on(video, "play", () => this._openSegment(video.currentTime));
    on(video, "playing", () => this._openSegment(video.currentTime));
    on(video, "pause", () => this._closeSegment(this.lastPlayingTime));
    on(video, "ended", () => {
      this._closeSegment(Math.max(this.lastPlayingTime ?? 0, video.duration || 0));
      this._log("🏁", "วิดีโอจบ (ended)");
    });
    on(video, "seeking", () => this._onSeeking());
    on(video, "seeked", () => this._onSeeked());
    on(video, "ratechange", () => this._onRateChange());
    on(video, "timeupdate", () => this._onTimeUpdate());
    on(document, "visibilitychange", () => {
      if (document.hidden && !video.paused) {
        video.pause(); // สลับแท็บ = ไม่นับ, บังคับหยุด
        this._log("👁", "สลับแท็บ → หยุดเล่นอัตโนมัติ (ไม่นับเวลาช่วงที่มองไม่เห็น)", "warn");
      }
    });
  }

  /** ถอด listener ทั้งหมด — เรียกตอนเปลี่ยนวิดีโอ/player element */
  destroy() {
    for (const [target, ev, fn] of this._bindings) target.removeEventListener(ev, fn);
    this._bindings = [];
    this.onChange = null;
    this.onLog = null;
  }

  _openSegment(t) {
    if (this.segmentStart === null) this.segmentStart = t;
  }

  _closeSegment(endAt) {
    if (this.segmentStart === null || endAt == null) {
      this.segmentStart = null;
      return;
    }
    if (endAt - this.segmentStart >= this.opts.minSegment) {
      this._addInterval(this.segmentStart, endAt);
    }
    this.segmentStart = null;
  }

  _addInterval(start, end) {
    let s = start, e = end;
    const out = [];
    for (const [a, b] of this.intervals) {
      if (b < s || a > e) out.push([a, b]);           // ไม่ทับกัน เก็บไว้
      else { s = Math.min(s, a); e = Math.max(e, b); } // ทับกัน → ขยายช่วง
    }
    out.push([s, e]);
    out.sort((x, y) => x[0] - y[0]);
    this.intervals = out;

    if (!this.completed && this.percent() >= this.opts.completionThreshold * 100) {
      this.completed = true;
      this._log("✅", `ดูครบเกณฑ์ ${this.opts.completionThreshold * 100}% ของวิดีโอแล้ว!`, "done");
    }
    this.onChange && this.onChange();
  }

  _onSeeking() {
    // สำคัญ: ตอน seeking, currentTime ถูกตั้งเป็น "จุดหมาย" ไปแล้ว
    // จุดเริ่มกรอต้องเอาจาก lastPlayingTime ไม่ใช่ currentTime
    if (this.pendingSeekFrom === null) {
      this.pendingSeekFrom = this.lastPlayingTime ?? this.segmentStart ?? this.video.currentTime;
    }
    this._closeSegment(this.lastPlayingTime);
  }

  _onSeeked() {
    const from = this.pendingSeekFrom;
    this.pendingSeekFrom = null;
    const to = this.video.currentTime;
    if (from != null && Math.abs(to - from) > 1) {
      const gap = fmt(Math.abs(to - from));
      if (to > from) this._log("⏩", `กรอไปหน้า ${fmt(from)} → ${fmt(to)} (ข้าม ${gap})`, "skip");
      else this._log("⏪", `กรอย้อนกลับ ${fmt(from)} → ${fmt(to)} (กลับ ${gap})`, "back");
    }
    if (!this.video.paused && !this.video.ended) this._openSegment(to);
    this.onChange && this.onChange();
  }

  _onTimeUpdate() {
    const v = this.video;
    if (v.paused || v.seeking) return;
    const ct = v.currentTime;
    if (this.lastPlayingTime !== null) {
      const d = ct - this.lastPlayingTime;
      // นับเฉพาะการไหลของเวลาแบบปกติ (รวม speed 1–2x) ไม่นับช่วงกระโดด
      if (d > 0 && d <= 1.5) this.totalPlayedTime += d;
    }
    this.lastPlayingTime = ct;
    this._openSegment(this.segmentStart ?? ct);
    this.onChange && this.onChange();
  }

  _onRateChange() {
    const v = this.video;
    if (v.playbackRate > this.opts.maxRate) {
      this._log("🚫", `ตั้งความเร็ว ${v.playbackRate}x → จำกัดไว้ที่ ${this.opts.maxRate}x`, "warn");
      v.playbackRate = this.opts.maxRate;
    }
  }

  _log(icon, text, cls = "") {
    this.onLog && this.onLog({ icon, text, cls });
  }

  watchedSeconds() {
    return this.intervals.reduce((n, [a, b]) => n + (b - a), 0);
  }

  percent() {
    const d = this.video.duration;
    if (!isFinite(d) || d <= 0) return 0;
    return (this.watchedSeconds() / d) * 100;
  }

  /** จุดแรกตั้งแต่ 0 ที่ยังไม่เคยดู (null = ดูครบทุกช่วงแล้ว) */
  firstUnwatched() {
    let t = 0;
    for (const [a, b] of this.intervals) {
      if (t < a) return t;
      t = Math.max(t, b);
    }
    return t < (this.video.duration || 0) - 0.001 ? t : null;
  }

  getProgress() {
    return {
      duration: this.video.duration || 0,
      watchedSeconds: +this.watchedSeconds().toFixed(1),
      percent: +this.percent().toFixed(2),
      completed: this.completed,
      totalPlayedSeconds: +this.totalPlayedTime.toFixed(1),
      intervals: this.intervals.map(([a, b]) => [+a.toFixed(1), +b.toFixed(1)]),
    };
  }

  reset() {
    this.intervals = [];
    this.segmentStart = null;
    this.lastPlayingTime = null;
    this.pendingSeekFrom = null;
    this.totalPlayedTime = 0;
    this.completed = false;
    this.onChange && this.onChange();
  }
}

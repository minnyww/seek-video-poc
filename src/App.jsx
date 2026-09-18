import { useRef, useState, useCallback, useEffect } from "react";
import ReactPlayer from "react-player";
import { mergeIntervals, watchedSeconds, fmt } from "./lib/intervals";

const VIDEO_URL = "https://lorem.video/720p";

export default function App() {
  const playerRef = useRef(null);
  const videoRef = useRef(null);
  const lastTick = useRef(null);
  const [rawIntervals, setRawIntervals] = useState([]);
  const [duration, setDuration] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [seeking, setSeeking] = useState(false);

  // Hook into the underlying <video> element once react-player mounts it
  useEffect(() => {
    const v = playerRef.current?.getInternalPlayer?.();
    if (!v || v === videoRef.current) return;
    videoRef.current = v;

    const onTimeUpdate = () => {
      if (!v.paused && !v.seeking) {
        if (lastTick.current != null && v.currentTime > lastTick.current) {
          setRawIntervals((prev) => [...prev, [lastTick.current, v.currentTime]]);
        }
        lastTick.current = v.currentTime;
      }
    };
    const onSeeking = () => {
      setSeeking(true);
      lastTick.current = null;
    };
    const onSeeked = () => {
      setSeeking(false);
      lastTick.current = v.currentTime;
    };

    v.addEventListener("timeupdate", onTimeUpdate);
    v.addEventListener("seeking", onSeeking);
    v.addEventListener("seeked", onSeeked);
    return () => {
      v.removeEventListener("timeupdate", onTimeUpdate);
      v.removeEventListener("seeking", onSeeking);
      v.removeEventListener("seeked", onSeeked);
    };
  }, [playing]);

  const merged = mergeIntervals(rawIntervals);
  const watched = watchedSeconds(rawIntervals);
  const percent = duration > 0 ? (watched / duration) * 100 : 0;

  useEffect(() => {
    window.__report = () => ({ merged, watched: +watched.toFixed(2), duration, percent: +percent.toFixed(2) });
  }, [merged, watched, duration, percent]);

  const seekTo = (t) => {
    const v = videoRef.current;
    if (v) v.currentTime = t;
  };

  const goToUnwatched = () => {
    const v = videoRef.current;
    if (!v || !duration) return;
    let cursor = 0;
    for (const [s, e] of merged) {
      if (cursor < s) break;
      cursor = Math.max(cursor, e);
    }
    seekTo(Math.min(cursor, duration - 0.1));
  };

  const reset = () => {
    setRawIntervals([]);
    lastTick.current = null;
    seekTo(0);
  };

  return (
    <div className="wrap">
      <header>
        <p className="eyebrow">VONDER · WATCH-TIME MONITOR</p>
        <h1>Video Watch Tracking PoC</h1>
        <p className="sub">
          นับเฉพาะช่วงที่ดูจริง (unique intervals) — กรอไปกรอกลับ/ดูซ้ำกี่รอบก็นับครั้งเดียว
        </p>
      </header>

      <div className="grid">
        <div className="playerBox">
          <ReactPlayer
            ref={playerRef}
            url={VIDEO_URL}
            controls
            width="100%"
            height="100%"
            style={{ position: "absolute", inset: 0 }}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onDuration={(d) => setDuration(d)}
          />
        </div>

        <aside className="panel">
          <p className="label">ความคืบหน้า</p>
          <p className="big">{percent.toFixed(1)}<span>%</span></p>
          <p className="frac">{fmt(watched)} / {fmt(duration)}</p>

          <dl>
            <div><dt>ความยาววิดีโอ</dt><dd>{fmt(duration)}</dd></div>
            <div><dt>ดูจริงแล้ว (unique)</dt><dd>{fmt(watched)}</dd></div>
            <div><dt>จำนวนช่วง</dt><dd>{merged.length}</dd></div>
            <div><dt>สถานะ</dt><dd>{playing ? "● เล่นอยู่" : "หยุด"}</dd></div>
          </dl>

          <div className="btns">
            <button onClick={() => seekTo(Math.max(0, (videoRef.current?.currentTime ?? 0) - 10))}>↩︎ 10 วิ</button>
            <button onClick={() => seekTo((videoRef.current?.currentTime ?? 0) + 30)}>30 วิ ↪︎</button>
            <button className="primary" onClick={goToUnwatched}>◎ ช่วงที่ยังไม่ได้ดู</button>
            <button onClick={reset}>Reset</button>
          </div>
        </aside>
      </div>

      <section className="timeline">
        <p className="label">Timeline · ช่วงที่ดูแล้ว (นับครั้งเดียว)</p>
        <div className="track">
          {duration > 0 &&
            merged.map(([s, e], i) => (
              <div
                key={i}
                className="seg"
                style={{ left: `${(s / duration) * 100}%`, width: `${((e - s) / duration) * 100}%` }}
              />
            ))}
        </div>
      </section>

      <footer>
        ทดลองใน console: <code>window.__report()</code> — กรอไปมาแล้วดูช่วงสีดำบน timeline รวมกันเป็น unique
      </footer>
    </div>
  );
}

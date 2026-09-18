# Video Watch Tracking PoC (React + react-player)

PoC สำหรับติดตามว่า user "ดูจริง" วิดีโอครบหรือยัง — ดักการกรอไปหน้า/ย้อนกลับ
แล้วนับเฉพาะช่วง timeline ที่เคยเล่นจริงเท่านั้น (ดูซ้ำกี่รอบนับครั้งเดียว)

## วิธีรัน

```bash
npm install
npm run dev     # เปิด http://localhost:5173
npm test        # เทส core logic แบบ offline
```

วิดีโอตัวอย่างดึงจาก `https://lorem.video/720p` (ต้องต่อเน็ต)
เปลี่ยนเป็น URL อื่นได้ที่ `VIDEO_URL` ใน `src/App.jsx`

## Deploy (Firebase Hosting)

Deploy อยู่ที่ **https://poc-video-test.web.app** — project `chayen-2`, site `poc-video-test`
(ดู `firebase.json` + `.firebaserc`)

```bash
npm run build
firebase deploy --only hosting --project chayen-2
```

หมายเหตุ: เคย deploy ที่ https://vonder.web.app (project `vondercenter`, site `vonder`) ไว้ด้วย
— project นั้น quota hosting sites เต็ม 36/36 จึงสร้าง site ใหม่ไม่ได้ (HTTP 429)
ถ้าจะกลับเนื้อหาเดิมของ site vonder: `firebase hosting:rollback --site vonder --project vondercenter`

## สถาปัตยกรรม

- **react-player v2** เล่นไฟล์ mp4 — ภายในห่อ `<video>` จริงอยู่
- เอา element นั้นมาผูกกับ `WatchTracker` ผ่าน `getInternalPlayer()` ใน callback `onReady`:

```jsx
<ReactPlayer
  ref={playerRef}
  url={VIDEO_URL}
  controls
  onReady={() => {
    const el = playerRef.current.getInternalPlayer(); // → HTMLVideoElement
    trackerRef.current = new WatchTracker(el);
  }}
/>
```

`WatchTracker` (`src/lib/WatchTracker.js`) เป็น vanilla class ไม่พึ่ง React —
ยกไปใช้กับ `<video>` ตรงๆ หรือ Vue/อื่นๆ ก็ได้

> หมายเหตุ: ถ้าเล่นผ่าน YouTube player, `getInternalPlayer()` จะได้ YT object
> ไม่ใช่ `<video>` (ไม่มี event seeking/seeked) ต้องเปลี่ยนเป็นวิธี poll
> `getCurrentTime()` + player state แทน — PoC นี้สำหรับไฟล์/URL วิดีโอตรง (mp4/webm)

## หลักการ

ไม่ใช้ `currentTime` ตอนเปิดทิ้งไว้ และไม่ใช้ Set ของวินาทีจาก `timeupdate`
(เพราะ `timeupdate` ถูก throttle ~4Hz และแทบไม่ยิงเลยตอนแท็บอยู่เบื้องหลัง — วินาทีจะหลุด)

แต่เก็บเป็น **interval ของช่วงที่เล่นจริง** แล้ว merge ช่วงทับซ้อน:

```
ดู 0:00 → 2:00       = [0, 120]
กรอไป 5:00 → 6:00    = [300, 360]
กรอกลับ 1:00 → 3:00  = [60, 180]

merge → [0,180], [300,360]  →  unique = 240 วิ = 4 นาที
```

การเปิด/ปิดช่วงผูกกับ event ของ `<video>`:

| Event | ทำอะไร |
|---|---|
| `play` / `playing` / `seeked` (ตอนกำลังเล่น) | เปิด segment ที่ `currentTime` |
| `pause` / `seeking` / `ended` | ปิด segment แล้ว merge เข้า intervals |
| `timeupdate` | อัปเดตตำแหน่งล่าสุด + เวลาเล่นรวม (UI) |

จุดที่ต้องระวัง:
- ตอน event `seeking` ยิง **`currentTime` เป็นจุดหมายแล้ว** — จุดเริ่มกรอต้องจาก `lastPlayingTime`
- เครือข่ายช้าๆ Chromium อาจยกเลิก seek กลางคัน (seek ไปที่ยังไม่ buffer แล้วเด้งกลับ) —
  guard `seeking` + `minSegment` 0.3 วิ ทำให้ช่วงพวกนี้ไม่ถูกนับ (ภาพค้าง = ไม่ใช่ดูจริง)
  ระบบจึง *นับน้อยกว่า* ในกรณีก้ำกึ่ง ไม่มีทางนับเกิน

## ป้องกันโกงที่ใส่ไว้ใน PoC

- **เล่นเร็ว**: `ratechange` บังคับ `playbackRate` ไม่เกิน 2x
- **สลับแท็บ**: `visibilitychange` → pause ทันที ไม่นับเวลาที่มองไม่เห็น
- **เปิดทิ้งไว้**: ไม่มี `timeupdate` ไหล = ไม่มี segment ใหม่
- เกณฑ์ "ครบ" ตั้งที่ **ดูจริง ≥ 99%** ของความยาว (ปรับได้ที่ `completionThreshold`)

## API

```js
tracker.getProgress()
// {
//   duration: 20,
//   watchedSeconds: 9.7,     // unique ที่ดูจริง
//   percent: 48.47,
//   completed: false,
//   totalPlayedSeconds: 11.3, // รวมรอบดูซ้ำ
//   intervals: [[0, 1.5], [5, 13.2]]
// }

tracker.firstUnwatched() // จุดแรกที่ยังไม่เคยดู (สำหรับปุ่ม "ไปจุดที่ยังไม่ได้ดู")
```

## ข้อจำกัด (ฝั่ง client)

ทุกอย่างนี้วัดในเบราว์เซอร์ — user ที่ตั้งใจจริงยังแก้ DOM/เรียก API ตรงๆ ได้
ถ้าเป็นคอร์ส/เนื้อหาที่ต้องบังคับ ให้ส่ง `intervals` + `totalPlayedSeconds`
ไป validate ฝั่ง server ด้วย เช่น ตรวจว่า unique ที่ส่งมาไม่โตเร็วกว่า
เวลาจริงที่ session นั้นมีชีวิต (watched ต้อง ≤ wall-clock ตั้งแต่เริ่มเล่น)
# seek-video-poc

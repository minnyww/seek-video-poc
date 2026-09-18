import { mergeIntervals, watchedSeconds } from "./src/lib/intervals.js";

// ตามโจทย์: ดู 0→120, 300→360, 60→180 => unique = 240s
const iv = [[0, 120], [300, 360], [60, 180]];
console.assert(
  JSON.stringify(mergeIntervals(iv)) === "[[0,180],[300,360]]" && watchedSeconds(iv) === 240,
  "FAIL scenario"
);
// ดูซ้ำ 10 รอบ [60,120] => 60s
const rep = Array.from({ length: 10 }, () => [60, 120]);
console.assert(watchedSeconds(rep) === 60, "FAIL rewatch");

console.log("tests:", mergeIntervals(iv), "| unique:", watchedSeconds(iv), "| rewatch:", watchedSeconds(rep));
console.log(mergeIntervals(iv).toString() === "0,180,300,360" && watchedSeconds(iv) === 240 && watchedSeconds(rep) === 60 ? "ALL PASS" : "FAILED");

// Unique interval tracking — merge overlapping [start, end] ranges
export function mergeIntervals(intervals) {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const merged = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    if (sorted[i][0] <= last[1]) {
      last[1] = Math.max(last[1], sorted[i][1]);
    } else {
      merged.push(sorted[i]);
    }
  }
  return merged;
}

export function watchedSeconds(intervals) {
  return mergeIntervals(intervals).reduce((sum, [s, e]) => sum + (e - s), 0);
}

export const fmt = (s) => {
  if (s == null || !isFinite(s)) return "--:--";
  s = Math.max(0, Math.round(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

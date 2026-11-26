export function money(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return sign + '$' + (Math.abs(cents) / 100).toFixed(2);
}

/** Splits $42.60 into ["$42", ".60"] for the big balance treatment. */
export function moneyParts(cents: number): [string, string] {
  const s = money(cents);
  const dot = s.indexOf('.');
  return [s.slice(0, dot), s.slice(dot)];
}

export function ago(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return 'JUST NOW';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} MIN AGO`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} HR AGO`;
  return `${Math.round(h / 24)} D AGO`;
}

export function pct(p: number): string {
  return Math.round(p * 100) + '%';
}

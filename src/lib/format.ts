const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');

export const fmtKg = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ''));

export const fmtDate = (d: Date = new Date()) => `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;

/** 1 = Monday … 7 = Sunday */
export const weekdayName = (iso: number) => LONG_DAYS[iso % 7];

export const fmtClock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};

export const fmtTonnes = (kg: number) => (kg >= 1000 ? `${(kg / 1000).toFixed(1).replace(/\.0$/, '')} t` : `${fmtInt(kg)} kg`);

export const shortDay = (d: Date) => DAYS[d.getDay()].toUpperCase();

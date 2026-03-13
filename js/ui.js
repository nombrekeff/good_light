import { getLightStatus, getNextEvent } from './solar.js';

// ── Format helpers ────────────────────────────────────────
export function fmtTime(d) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function fmtMins(m) {
  m = Math.max(0, Math.round(m));
  const h = Math.floor(m / 60), mn = m % 60;
  return h > 0 ? `${h}h ${mn}m` : `${mn}m`;
}

export function fmtDur(startD, endD) {
  const mins = Math.round((endD - startD) / 60000);
  return fmtMins(mins);
}

// ── Toggle active state on a schedule card ────────────────
export function setActive(id, type, active) {
  const el = document.getElementById(id);
  el.classList.toggle(`active-${type}`, active);
}

// ── UI update (called every animation frame) ──────────────
export function updateUI(solar, displayMins) {
  if (displayMins === null || displayMins === undefined) {
    const now = new Date();
    displayMins = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  }
  const mins = displayMins;
  const st   = getLightStatus(mins, solar);
  const ql   = document.getElementById('quality-label');

  if (ql.textContent !== st.label) ql.textContent = st.label;
  if (!ql.className.includes(st.cls)) ql.className = st.cls;

  const next = getNextEvent(mins, solar);
  document.getElementById('next-event').textContent =
    next ? `${next.name} in ${fmtMins(next.minsUntil)}` : '';

  // Card active states
  const { civilBegin: cb, sunrise: sr, sunset: ss, civilEnd: ce } = solar;
  setActive('card-blue-am', 'blue',  mins >= cb        && mins <  sr);
  setActive('card-gold-am', 'gold',  mins >= sr        && mins <= sr + 60);
  setActive('card-gold-pm', 'gold',  mins >= ss - 60   && mins <= ss);
  setActive('card-blue-pm', 'blue',  mins >  ss        && mins <= ce);
}

// ── Populate schedule cards after solar data loads ────────
export function populateCards(solar) {
  const { civilBeginDate: cbD, sunriseDate: srD,
          sunsetDate: ssD, civilEndDate: ceD } = solar;

  const goldAMend   = new Date(srD.getTime() + 60 * 60000);
  const goldPMstart = new Date(ssD.getTime() - 60 * 60000);

  // Blue-AM: civil begin → sunrise
  document.getElementById('blue-am-time').textContent =
    `${fmtTime(cbD)} – ${fmtTime(srD)}`;
  document.getElementById('blue-am-dur').textContent =
    fmtDur(cbD, srD);

  // Gold-AM: sunrise → sunrise+60 (golden hour is fixed at 60 min by definition)
  document.getElementById('gold-am-time').textContent =
    `${fmtTime(srD)} – ${fmtTime(goldAMend)}`;
  document.getElementById('gold-am-dur').textContent = '60 min';

  // Gold-PM: sunset-60 → sunset (golden hour is fixed at 60 min by definition)
  document.getElementById('gold-pm-time').textContent =
    `${fmtTime(goldPMstart)} – ${fmtTime(ssD)}`;
  document.getElementById('gold-pm-dur').textContent = '60 min';

  // Blue-PM: sunset → civil end
  document.getElementById('blue-pm-time').textContent =
    `${fmtTime(ssD)} – ${fmtTime(ceD)}`;
  document.getElementById('blue-pm-dur').textContent =
    fmtDur(ssD, ceD);

  // Sun times line
  document.getElementById('sun-times').textContent =
    `↑ ${fmtTime(srD)}  ·  ↓ ${fmtTime(ssD)}`;

  // Footer date
  const today = new Date();
  document.getElementById('today-date').textContent =
    today.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

// ── Error display ─────────────────────────────────────────
export function showError(msg) {
  const el = document.getElementById('error-banner');
  el.textContent = msg;
  el.style.display = 'block';
}

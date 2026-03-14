/* =========================================================
   GOOD LIGHT — Photography Golden Hour Guide
   Canvas "Light Wheel" + Sunrise-Sunset API
   ========================================================= */

import { fetchSolar, getLocationName, getLightStatus } from './solar.js';
import { redraw, drawBackground, RING_START, TAU } from './canvas.js';
import { updateUI, populateCards, showError } from './ui.js';

const canvas  = document.getElementById('wheel');
const ctx     = canvas.getContext('2d');
const bgCanvas = document.getElementById('bg');
const bgCtx    = bgCanvas.getContext('2d');
const tooltip = document.getElementById('ring-tooltip');

// ── State ─────────────────────────────────────────────────
let solar        = null;   // parsed solar data
let skyRingCache = null;   // offscreen canvas for static ring
let animId       = null;   // animation frame id
let pinMins      = null;   // null = live current time; set while user drags the pin
let isDragging   = false;  // true while a drag gesture is in progress

// ── Canvas sizing ─────────────────────────────────────────
function resize() {
  const dpr = window.devicePixelRatio || 1;
  const s = Math.min(window.innerWidth - 32, 520);
  // Set CSS display size (layout unchanged)
  canvas.style.width  = s + 'px';
  canvas.style.height = s + 'px';
  // Set buffer size at native device resolution for crisp HiDPI rendering
  canvas.width  = Math.round(s * dpr);
  canvas.height = Math.round(s * dpr);
  skyRingCache  = null;   // invalidate cache
  bgCanvas.style.width  = window.innerWidth  + 'px';
  bgCanvas.style.height = window.innerHeight + 'px';
  bgCanvas.width  = Math.round(window.innerWidth  * dpr);
  bgCanvas.height = Math.round(window.innerHeight * dpr);
}
resize();
window.addEventListener('resize', () => {
  resize();
  if (solar) skyRingCache = redraw(canvas, ctx, solar, skyRingCache);
});

// ── Animation loop ────────────────────────────────────────
function drawBgCanvas(nowMin, t) {
  const w  = bgCanvas.width;
  const h  = bgCanvas.height;
  const cx = w / 2, cy = h / 2;
  bgCtx.clearRect(0, 0, w, h);
  drawBackground(bgCtx, cx, cy, w, h, nowMin, t, solar);
}

function animate() {
  const now    = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const t      = performance.now();
  // Use the pinned time while the user is dragging; fall back to live current time.
  const displayMins = pinMins !== null ? pinMins : nowMin;
  skyRingCache = redraw(canvas, ctx, solar, skyRingCache, displayMins, t);
  drawBgCanvas(displayMins, t);
  updateUI(solar, displayMins);
  animId = requestAnimationFrame(animate);
}

// ── Pointer helpers ───────────────────────────────────────
// Convert a viewport position to minutes (0-1440) on the ring.
function ptrMins(clientX, clientY) {
  const rect  = canvas.getBoundingClientRect();
  const scale = canvas.width / rect.width;
  const cx    = canvas.width / 2, cy = canvas.height / 2;
  const dx    = (clientX - rect.left) * scale - cx;
  const dy    = (clientY - rect.top)  * scale - cy;
  let ang = Math.atan2(dy, dx) - RING_START;
  if (ang < 0) ang += TAU;
  return (ang / TAU) * 1440;
}

// Return true when the pointer falls on the ring band.
function ptrOnRing(clientX, clientY) {
  const rect   = canvas.getBoundingClientRect();
  const scale  = canvas.width / rect.width;
  const cx     = canvas.width / 2, cy = canvas.height / 2;
  const dx     = (clientX - rect.left) * scale - cx;
  const dy     = (clientY - rect.top)  * scale - cy;
  const dist   = Math.hypot(dx, dy);
  const outerR = cx * 0.865;
  const innerR = cx * 0.525;
  return dist >= innerR - 4 && dist <= outerR + 10;
}

// ── Ring tooltip on hover ─────────────────────────────────
canvas.addEventListener('mousemove', (e) => {
  if (!solar) return;
  // While dragging, tooltip is hidden — the centre already shows the time.
  if (isDragging) return;

  const onRing = ptrOnRing(e.clientX, e.clientY);
  canvas.style.cursor = onRing ? 'grab' : 'crosshair';

  if (onRing) {
    const mins = ptrMins(e.clientX, e.clientY);
    const h    = Math.floor(mins / 60);
    const mn   = String(Math.floor(mins % 60)).padStart(2, '0');
    const st   = getLightStatus(mins, solar);
    tooltip.textContent   = `${String(h).padStart(2,'0')}:${mn}  ·  ${st.label}`;
    tooltip.style.display = 'block';
    tooltip.style.left    = `${e.clientX + 14}px`;
    tooltip.style.top     = `${e.clientY - 32}px`;
  } else {
    tooltip.style.display = 'none';
  }
});

canvas.addEventListener('mouseleave', () => {
  if (!isDragging) {
    tooltip.style.display = 'none';
    canvas.style.cursor   = 'crosshair';
  }
});

// ── Pin drag — mouse ──────────────────────────────────────
canvas.addEventListener('mousedown', (e) => {
  if (!solar || !ptrOnRing(e.clientX, e.clientY)) return;
  isDragging             = true;
  pinMins                = (ptrMins(e.clientX, e.clientY) + 720) % 1440;
  canvas.style.cursor        = 'grabbing';
  document.body.style.cursor = 'grabbing';
  tooltip.style.display      = 'none';
  e.preventDefault();
});

// Track the mouse across the whole window so fast drags don't lose the pin.
window.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  pinMins = (ptrMins(e.clientX, e.clientY) + 720) % 1440;
});

window.addEventListener('mouseup', () => {
  if (!isDragging) return;
  isDragging                 = false;
  pinMins                    = null;
  canvas.style.cursor        = 'crosshair';
  document.body.style.cursor = '';
});

// ── Pin drag — touch ──────────────────────────────────────
canvas.addEventListener('touchstart', (e) => {
  if (!solar || e.touches.length !== 1) return;
  const t = e.touches[0];
  if (!ptrOnRing(t.clientX, t.clientY)) return;
  isDragging = true;
  pinMins    = (ptrMins(t.clientX, t.clientY) + 720) % 1440;
  e.preventDefault();
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  if (!isDragging || e.touches.length === 0) return;
  const t = e.touches[0];
  pinMins = (ptrMins(t.clientX, t.clientY) + 720) % 1440;
  e.preventDefault();
}, { passive: false });

canvas.addEventListener('touchend', () => {
  if (!isDragging) return;
  isDragging = false;
  pinMins    = null;
});

// ── Boot sequence ─────────────────────────────────────────
async function startWithCoords(lat, lng) {
  const [s, name] = await Promise.all([
    fetchSolar(lat, lng),
    getLocationName(lat, lng),
  ]);
  solar = s;
  document.getElementById('location-name').textContent = name;
  populateCards(solar);

  const ld = document.getElementById('loading');
  ld.classList.add('hidden');
  setTimeout(() => { ld.style.display = 'none'; }, 800);
  animate();
}

async function init() {
  if (!navigator.geolocation) {
    document.getElementById('loader-msg').textContent = 'Geolocation unavailable — using default';
    await startWithCoords(51.5074, -0.1278); // London fallback
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      try {
        await startWithCoords(pos.coords.latitude, pos.coords.longitude);
      } catch (err) {
        showError('Could not load light data. Please try refreshing.');
        console.error(err);
      }
    },
    async (err) => {
      const msg = err.code === 1
        ? 'Location permission denied — showing London as example'
        : 'Could not detect location — showing London as example';
      document.getElementById('loader-msg').textContent = msg;
      showError(msg);
      await startWithCoords(51.5074, -0.1278);
    },
    { timeout: 10000, enableHighAccuracy: false }
  );
}

init();

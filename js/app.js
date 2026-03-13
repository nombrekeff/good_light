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

// ── Canvas sizing ─────────────────────────────────────────
function resize() {
  const s = Math.min(window.innerWidth - 32, 520);
  canvas.width  = s;
  canvas.height = s;
  skyRingCache  = null;   // invalidate cache
  bgCanvas.width  = window.innerWidth;
  bgCanvas.height = window.innerHeight;
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
  skyRingCache = redraw(canvas, ctx, solar, skyRingCache, nowMin, t);
  drawBgCanvas(nowMin, t);
  updateUI(solar);
  animId = requestAnimationFrame(animate);
}

// ── Ring tooltip on hover ─────────────────────────────────
canvas.addEventListener('mousemove', (e) => {
  if (!solar) return;
  const rect  = canvas.getBoundingClientRect();
  const scale = canvas.width / rect.width;
  const mx    = (e.clientX - rect.left) * scale;
  const my    = (e.clientY - rect.top)  * scale;
  const cx    = canvas.width / 2, cy = canvas.height / 2;
  const dx    = mx - cx, dy = my - cy;
  const dist  = Math.hypot(dx, dy);
  const outerR = cx * 0.865;
  const innerR = cx * 0.525;

  if (dist >= innerR - 4 && dist <= outerR + 10) {
    let ang = Math.atan2(dy, dx) - RING_START;
    if (ang < 0) ang += TAU;
    const mins = (ang / TAU) * 1440;
    const h    = Math.floor(mins / 60);
    const mn   = String(Math.floor(mins % 60)).padStart(2, '0');
    const st   = getLightStatus(mins, solar);
    tooltip.textContent  = `${String(h).padStart(2,'0')}:${mn}  ·  ${st.label}`;
    tooltip.style.display = 'block';
    tooltip.style.left    = `${e.clientX + 14}px`;
    tooltip.style.top     = `${e.clientY - 32}px`;
  } else {
    tooltip.style.display = 'none';
  }
});

canvas.addEventListener('mouseleave', () => {
  tooltip.style.display = 'none';
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

import { getLightStatus } from './solar.js';

export const TAU        = Math.PI * 2;
// midnight (00:00) sits at the top (12 o'clock position)
export const RING_START = -Math.PI / 2;

// Deterministic star positions for centre sky (no Math.random — consistent across reloads)
export const STARS = Array.from({ length: 42 }, (_, i) => {
  const a  = i * 2.399963;                      // golden angle for even Fibonacci distribution
  const r  = Math.sqrt((i + 0.5) / 42) * 0.82; // radius via square-root for uniform density
  const sz = 0.4 + (i % 7) * (0.7 / 6);        // size cycles 0.4 → 1.1
  const op = 0.35 + (i % 5) * (0.55 / 4);      // opacity cycles 0.35 → 0.90
  return { x: r * Math.cos(a), y: r * Math.sin(a), sz, op };
});

// ── Colour helpers ────────────────────────────────────────
function lerp(a, b, t) { return a + (b - a) * t; }

function lerpRGB(c1, c2, t) {
  return [
    Math.round(lerp(c1[0], c2[0], t)),
    Math.round(lerp(c1[1], c2[1], t)),
    Math.round(lerp(c1[2], c2[2], t)),
  ];
}

function rgbStr([r, g, b]) { return `rgb(${r},${g},${b})`; }

// ── Sky colour for a time in minutes [0,1440) ─────────────
export function getSkyColor(mins, s) {
  const m = ((mins % 1440) + 1440) % 1440;

  // Key colour stops anchored to actual solar events
  const gAMend  = s.sunrise + 60;
  const gPMst   = s.sunset  - 60;

  const stops = [
    [0,                              [5,  8, 22]],
    [s.astroBegin,                   [8, 13, 35]],
    [s.nautBegin,                    [14, 24, 62]],
    [s.civilBegin,                   [22, 48,120]],
    [s.civilBegin + (s.sunrise - s.civilBegin) * 0.55, [38, 62,148]], // 55% through civil twilight — mid blue-hour peak
    [s.sunrise - 18,                 [95, 65,115]],
    [s.sunrise,                      [225,125, 52]],
    [s.sunrise + 35,                 [242,188, 72]],
    [gAMend,                         [145,198,232]],
    [gAMend + 50,                    [ 98,168,225]],
    [s.noon,                         [ 72,138,215]],
    [s.noon + 50,                    [ 98,168,225]],
    [gPMst - 50,                     [145,198,232]],
    [gPMst,                          [242,182, 68]],
    [s.sunset - 18,                  [218,115, 42]],
    [s.sunset,                       [188, 82, 58]],
    [s.sunset + 18,                  [ 95, 55,102]],
    [s.civilEnd - (s.civilEnd - s.sunset) * 0.45, [38, 58,138]], // 45% through evening civil twilight — mid evening blue-hour
    [s.civilEnd,                     [22, 42,110]],
    [s.nautEnd,                      [12, 20, 52]],
    [s.astroEnd,                     [ 7, 11, 30]],
    [1440,                           [ 5,  8, 22]],
  ];

  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (m >= t0 && m <= t1) {
      const t = t1 === t0 ? 0 : (m - t0) / (t1 - t0);
      // ease-in-out for smoother blending
      const te = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      return rgbStr(lerpRGB(c0, c1, te));
    }
  }
  return 'rgb(5,8,22)';
}

// ── Build static sky-ring offscreen canvas ────────────────
export function buildSkyRing(s, canvas) {
  const sz = canvas.width;
  const oc = document.createElement('canvas');
  oc.width  = sz;
  oc.height = sz;
  const oc2 = oc.getContext('2d');
  const cx = sz / 2, cy = sz / 2;
  const outerR = cx * 0.865;
  const innerR = cx * 0.525;

  if (typeof oc2.createConicGradient === 'function') {
    // Native conic gradient: perfectly smooth, no banding, hardware-accelerated.
    // Pre-sample one stop per minute (1440 stops) so the eased colour curve is
    // faithfully captured; the browser linearly interpolates between stops.
    const STOPS = 1440;
    const grad = oc2.createConicGradient(RING_START, cx, cy);
    for (let i = 0; i <= STOPS; i++) {
      const offset = Math.min(i / STOPS, 1);
      grad.addColorStop(offset, getSkyColor(offset * 1440, s));
    }
    // Fill the full outer disc, then punch out the inner hole.
    oc2.beginPath();
    oc2.arc(cx, cy, outerR, 0, TAU);
    oc2.fillStyle = grad;
    oc2.fill();
    try {
      oc2.globalCompositeOperation = 'destination-out';
      oc2.beginPath();
      oc2.arc(cx, cy, innerR, 0, TAU);
      oc2.fill();
    } finally {
      oc2.globalCompositeOperation = 'source-over';
    }
  } else {
    // Fallback for browsers without createConicGradient: use 1-minute resolution
    // segments (1440 segments) to minimise visible stepping.
    const SEG = 1440;
    for (let i = 0; i < SEG; i++) {
      const mins = (i / SEG) * 1440;
      const a1 = RING_START + (i / SEG) * TAU;
      const a2 = RING_START + ((i + 1) / SEG) * TAU;

      oc2.beginPath();
      oc2.arc(cx, cy, outerR, a1, a2);
      oc2.arc(cx, cy, innerR, a2, a1, true);
      oc2.closePath();
      oc2.fillStyle = getSkyColor(mins, s);
      oc2.fill();
    }
  }
  return oc;
}

// ── Draw a glowing highlight arc for a time window ────────
export function drawGlowArc(ctx, cx, cy, outerR, innerR, startM, endM, color, alpha) {
  if (endM <= startM) return;
  const a1   = RING_START + (startM / 1440) * TAU;
  const a2   = RING_START + (endM   / 1440) * TAU;
  const midR = (outerR + innerR) / 2;
  const wid  = (outerR - innerR) * 0.82;

  ctx.save();
  ctx.shadowBlur  = wid * 1.2;
  ctx.shadowColor = color;
  ctx.globalAlpha = alpha;
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, midR, a1, a2);
  ctx.lineWidth   = wid * 0.45;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.restore();
}

// ── Draw stars inside a clipped circle ───────────────────
export function drawStars(ctx, cx, cy, r, t) {
  STARS.forEach((s, i) => {
    const twinkle = 0.5 + 0.5 * Math.sin(t / 1800 + i * 1.618);
    ctx.beginPath();
    ctx.arc(cx + s.x * r, cy + s.y * r, s.sz, 0, TAU);
    ctx.fillStyle = `rgba(255,255,255,${s.op * twinkle})`;
    ctx.fill();
  });
}

// ── Centre animated sky circle ────────────────────────────
export function drawCentre(ctx, cx, cy, r, nowMins, t, solar) {
  const status = getLightStatus(nowMins, solar);
  const pulse  = 0.85 + 0.15 * Math.sin(t / 1200);

  // Base sky gradient
  const innerCol = {
    golden:      ['#e8b030', '#b84010'],
    'blue-hour': ['#5878d0', '#10208a'],
    day:         ['#78b0e0', '#2868c0'],
    harsh:       ['#a0c0e0', '#4880c8'],
    night:       ['#101828', '#040a14'],
  }[status.cls] || ['#101828', '#040a14'];

  const g = ctx.createRadialGradient(cx, cy - r * 0.15, r * 0.05, cx, cy, r);
  g.addColorStop(0, innerCol[0]);
  g.addColorStop(1, innerCol[1]);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.clip();

  ctx.fillStyle = g;
  ctx.fill();

  if (status.cls === 'night') {
    drawStars(ctx, cx, cy, r * 0.88, t);
  }

  // Sun / moon orb
  if (status.cls !== 'night') {
    const oy  = cy - r * 0.25;
    const or2 = r * 0.17 * pulse;
    const sg  = ctx.createRadialGradient(cx, oy, 0, cx, oy, or2 * 2.2);
    if (status.cls === 'golden') {
      sg.addColorStop(0, 'rgba(255,235,80,0.95)');
      sg.addColorStop(0.45, 'rgba(255,180,40,0.55)');
      sg.addColorStop(1, 'rgba(255,140,20,0)');
    } else {
      sg.addColorStop(0, 'rgba(210,230,255,0.85)');
      sg.addColorStop(0.5, 'rgba(160,200,255,0.35)');
      sg.addColorStop(1, 'rgba(120,170,255,0)');
    }
    ctx.beginPath();
    ctx.arc(cx, oy, or2 * 2.2, 0, TAU);
    ctx.fillStyle = sg;
    ctx.fill();
    // Solid core
    ctx.beginPath();
    ctx.arc(cx, oy, or2, 0, TAU);
    ctx.fillStyle = status.cls === 'golden' ? '#ffe060' : '#daeaff';
    ctx.fill();
  } else {
    // Moon crescent
    const mx = cx + r * 0.08, my = cy - r * 0.2, mr = r * 0.15;
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, TAU);
    ctx.fillStyle = 'rgba(210,225,255,0.7)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(mx + mr * 0.45, my - mr * 0.05, mr * 0.85, 0, TAU);
    ctx.fillStyle = innerCol[1];
    ctx.fill();
  }

  // Subtle horizon line for golden / blue hour
  if (status.cls === 'golden' || status.cls === 'blue-hour') {
    const hg = ctx.createLinearGradient(cx - r, cy + r * 0.25, cx + r, cy + r * 0.25);
    const hc = status.cls === 'golden'
      ? 'rgba(240,190,60,' : 'rgba(100,150,240,';
    hg.addColorStop(0, hc + '0)');
    hg.addColorStop(0.5, hc + '0.18)');
    hg.addColorStop(1, hc + '0)');
    ctx.fillStyle = hg;
    ctx.fillRect(cx - r, cy + r * 0.1, r * 2, r * 0.55);
  }

  ctx.restore();

  // Inner ring border
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

// ── Animated full-canvas sky background ───────────────────
export function drawBackground(ctx, cx, cy, w, h, nowMin, t, solar) {
  const status = getLightStatus(nowMin, solar);

  const bgCol = {
    golden:      ['#c87820', '#80200a'],
    'blue-hour': ['#3858b0', '#08186a'],
    day:         ['#4890c0', '#1050a0'],
    harsh:       ['#80a0c0', '#2860a8'],
    night:       ['#0c1420', '#020608'],
  }[status.cls] || ['#0c1420', '#020608'];

  const sz = Math.max(w, h);
  const g = ctx.createRadialGradient(cx, cy * 0.4, sz * 0.05, cx, cy, sz * 0.75);
  g.addColorStop(0, bgCol[0]);
  g.addColorStop(1, bgCol[1]);

  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  if (status.cls === 'night') {
    drawStars(ctx, cx, cy, sz * 0.72, t);
  }
}

// ── Main draw function ────────────────────────────────────
// Returns the (potentially newly built) skyRingCache.
export function redraw(canvas, ctx, solar, skyRingCache, nowMin, t) {
  if (!solar) return skyRingCache;
  const sz = canvas.width;
  const cx = sz / 2, cy = sz / 2;
  const majorSz = sz * 0.032;
  // Ensure cardinal hour labels (placed at outerR + 23) fit within the canvas
  // on small mobile screens by shrinking the ring just enough.
  const outerR = Math.min(cx * 0.865, cx - 24 - majorSz * 0.5);
  const innerR = cx * 0.525;

  // Caller may pass pre-computed values to avoid duplicate work per frame.
  const now = new Date();
  if (t      === undefined) t      = performance.now();
  if (nowMin === undefined) nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;

  ctx.clearRect(0, 0, sz, sz);

  // Sky ring (static, cached)
  if (!skyRingCache) skyRingCache = buildSkyRing(solar, canvas);
  ctx.drawImage(skyRingCache, 0, 0);

  // Golden-hour glow arcs (pulse slightly)
  const gPulse = 0.32 + 0.08 * Math.sin(t / 900);
  const bPulse = 0.28 + 0.07 * Math.sin(t / 1100);

  // Morning blue hour: civil begin → sunrise
  drawGlowArc(ctx, cx, cy, outerR, innerR,
    solar.civilBegin, solar.sunrise, '#4468d0', bPulse);

  // Morning golden hour: sunrise → sunrise+60
  drawGlowArc(ctx, cx, cy, outerR, innerR,
    solar.sunrise, solar.sunrise + 60, '#e8a040', gPulse);

  // Evening golden hour: sunset-60 → sunset
  drawGlowArc(ctx, cx, cy, outerR, innerR,
    solar.sunset - 60, solar.sunset, '#e8a040', gPulse);

  // Evening blue hour: sunset → civil end
  drawGlowArc(ctx, cx, cy, outerR, innerR,
    solar.sunset, solar.civilEnd, '#4468d0', bPulse);

  // Hour tick marks + labels
  for (let h = 0; h < 24; h++) {
    const angle = RING_START + (h / 24) * TAU;
    const isMaj = h % 6 === 0;
    const r1 = outerR + (isMaj ? 5 : 2);
    const r2 = outerR + (isMaj ? 14 : 8);
    ctx.beginPath();
    ctx.moveTo(cx + r1 * Math.cos(angle), cy + r1 * Math.sin(angle));
    ctx.lineTo(cx + r2 * Math.cos(angle), cy + r2 * Math.sin(angle));
    ctx.strokeStyle = isMaj ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.1)';
    ctx.lineWidth   = isMaj ? 1.5 : 1;
    ctx.stroke();

    if (isMaj) {
      const lr = outerR + 23;
      ctx.font         = `${majorSz}px Montserrat, sans-serif`;
      ctx.fillStyle    = 'rgba(200,195,185,0.75)';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        h === 0 ? '00' : String(h),
        cx + lr * Math.cos(angle),
        cy + lr * Math.sin(angle)
      );
    }
  }

  // Current-time needle + dot
  // While dragging, pinMins is offset by half a day so the needle sits on the
  // opposite side of the ring from the user's thumb/cursor; nowAng already
  // lands at that opposite position, so no extra offset is needed.
  const nowAng = RING_START + (nowMin / 1440) * TAU;
  const needleAng = nowAng;
  const dotR   = (outerR + innerR) / 2;
  const dotX   = cx + dotR * Math.cos(needleAng);
  const dotY   = cy + dotR * Math.sin(needleAng);

  // Thin needle from centre
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(dotX, dotY);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth   = 1.5;
  ctx.stroke();

  // Glow halo around dot
  const gs = sz * 0.02;
  const gg = ctx.createRadialGradient(dotX, dotY, 0, dotX, dotY, gs * 2.8);
  gg.addColorStop(0,   'rgba(255,255,255,0.95)');
  gg.addColorStop(0.4, 'rgba(255,210,100,0.5)');
  gg.addColorStop(1,   'rgba(255,200,80,0)');
  ctx.beginPath();
  ctx.arc(dotX, dotY, gs * 2.8, 0, TAU);
  ctx.fillStyle = gg;
  ctx.fill();
  // Solid core dot
  ctx.beginPath();
  ctx.arc(dotX, dotY, gs, 0, TAU);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // Centre sky circle
  drawCentre(ctx, cx, cy, innerR * 0.92, nowMin, t, solar);

  // Current-time clock overlay in centre
  const centreR  = innerR * 0.92;
  const dispH    = Math.floor(nowMin / 60) % 24;
  const dispM    = Math.floor(nowMin % 60);
  const timeStr  = `${String(dispH).padStart(2, '0')}:${String(dispM).padStart(2, '0')}`;
  const fontSize = Math.max(10, Math.round(centreR * 0.44)); // ~44% of centre radius
  ctx.save();
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor  = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur   = 10;
  ctx.font         = `400 ${fontSize}px 'Playfair Display', Georgia, serif`;
  ctx.fillStyle    = 'rgba(255,255,255,0.82)';
  ctx.fillText(timeStr, cx, cy + centreR * 0.34); // lower third of centre circle
  ctx.restore();

  return skyRingCache;
}

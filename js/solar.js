// ── Light-status for a given time (minutes since midnight) ───────────────────
export function getLightStatus(mins, solar) {
  if (!solar) return { label: 'Night', cls: 'night' };
  const { civilBegin, sunrise, sunset, civilEnd } = solar;
  const m = ((mins % 1440) + 1440) % 1440;

  if (m >= sunrise      && m <= sunrise + 60) return { label: 'Golden Hour',  cls: 'golden' };
  if (m >= sunset - 60  && m <= sunset)        return { label: 'Golden Hour',  cls: 'golden' };
  if (m >= civilBegin   && m < sunrise)         return { label: 'Blue Hour',    cls: 'blue-hour' };
  if (m > sunset        && m <= civilEnd)       return { label: 'Blue Hour',    cls: 'blue-hour' };

  const harshMid   = solar.noon;
  const harshStart = sunrise + 90;
  const harshEnd   = sunset  - 90;
  if (m > harshStart && m < harshEnd) {
    if (Math.abs(m - harshMid) < 90) return { label: 'Harsh Light', cls: 'harsh' };
    return { label: 'Soft Light', cls: 'day' };
  }
  if (m > sunrise + 60 && m < sunset - 60) return { label: 'Soft Light', cls: 'day' };
  return { label: 'Night', cls: 'night' };
}

// ── Next photography event from now ──────────────────────────────────────────
export function getNextEvent(mins, solar) {
  if (!solar) return null;
  const { civilBegin, sunrise, sunset, civilEnd } = solar;
  const m = ((mins % 1440) + 1440) % 1440;

  const events = [
    { name: 'Blue Hour',   time: civilBegin },
    { name: 'Golden Hour', time: sunrise },
    { name: 'Golden Hour', time: sunset - 60 },
    { name: 'Blue Hour',   time: sunset },
  ].filter(e => e.time > m);

  if (events.length === 0) {
    // Tomorrow's first blue hour
    return { name: 'Blue Hour', minsUntil: 1440 - m + civilBegin };
  }
  return { name: events[0].name, minsUntil: events[0].time - m };
}

// ── Parse sunrise-sunset.org API response ─────────────────────────────────────
export function parseSolar(data) {
  const r = data.results;
  const toMins = (s) => {
    const d = new Date(s);
    return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  };
  const toDate = (s) => new Date(s);

  return {
    civilBegin:    toMins(r.civil_twilight_begin),
    nautBegin:     toMins(r.nautical_twilight_begin),
    astroBegin:    toMins(r.astronomical_twilight_begin),
    sunrise:       toMins(r.sunrise),
    noon:          toMins(r.solar_noon),
    sunset:        toMins(r.sunset),
    civilEnd:      toMins(r.civil_twilight_end),
    nautEnd:       toMins(r.nautical_twilight_end),
    astroEnd:      toMins(r.astronomical_twilight_end),
    // Full Date objects for display
    civilBeginDate: toDate(r.civil_twilight_begin),
    sunriseDate:    toDate(r.sunrise),
    sunsetDate:     toDate(r.sunset),
    civilEndDate:   toDate(r.civil_twilight_end),
  };
}

// ── Reverse geocode via OpenStreetMap Nominatim ───────────────────────────────
export async function getLocationName(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;
    const res = await fetch(url, {
      headers: {
        'Accept-Language': 'en',
        'User-Agent': 'GoodLight/1.0 (https://github.com/nombrekeff/good_light)',
      },
    });
    if (!res.ok) throw new Error('nominatim error');
    const d = await res.json();
    const city    = d.address?.city || d.address?.town || d.address?.village || d.address?.county || '';
    const country = (d.address?.country_code || '').toUpperCase();
    return city ? `${city}, ${country}` : `${lat.toFixed(2)}°, ${lng.toFixed(2)}°`;
  } catch {
    return `${lat.toFixed(2)}°, ${lng.toFixed(2)}°`;
  }
}

// ── Fetch solar data from sunrise-sunset.org ──────────────────────────────────
export async function fetchSolar(lat, lng) {
  const date = new Date().toISOString().slice(0, 10);
  const url  = `https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lng}&formatted=0&date=${date}`;
  const res  = await fetch(url);
  if (!res.ok) throw new Error('Solar API failed');
  const data = await res.json();
  if (data.status !== 'OK') throw new Error('Solar API: ' + data.status);
  return parseSolar(data);
}

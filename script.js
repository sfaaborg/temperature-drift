const PAINTER_MAP = [
  {
    minDelta: 5,
    artist: "J. M. W. Turner",
    caption: "The world is running hotter than it used to. Turner saw fire in everything."
  },
  {
    minDelta: 2,
    artist: "Joaquin Sorolla",
    caption: "A heavy warmth that didn't used to be here. Sorolla painted light as weight."
  },
  {
    minDelta: 0.5,
    artist: "Pierre-Auguste Renoir",
    caption: "Slightly warmer than history remembers. A gentle drift."
  },
  {
    minDelta: -0.5,
    artist: "Johannes Vermeer",
    caption: "Today sits almost exactly where it always has. Still. Exact."
  },
  {
    minDelta: -2,
    artist: "James McNeill Whistler",
    caption: "Cooler than the historical record. Something is receding."
  },
  {
    minDelta: -5,
    artist: "Caspar David Friedrich",
    caption: "Significantly colder than it used to be here. Friedrich knew this kind of cold."
  },
  {
    minDelta: -Infinity,
    artist: "Pieter Bruegel the Elder",
    caption: "A deep cold. The kind that used to be rare. Bruegel painted winters that no longer come."
  }
];

function getPainterForDelta(delta) {
  for (const entry of PAINTER_MAP) {
    if (delta >= entry.minDelta) return entry;
  }
  return PAINTER_MAP[PAINTER_MAP.length - 1];
}

async function geocode(address) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
  const res = await fetch(url, {
    headers: { 'Accept-Language': 'en', 'User-Agent': 'temperature-drift-site' }
  });
  const data = await res.json();
  if (!data || data.length === 0) throw new Error("Address not found. Try being more specific.");
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), name: data[0].display_name };
}

async function getTodayTemp(lat, lon) {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${dateStr}&end_date=${dateStr}&daily=temperature_2m_mean&timezone=auto`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.daily || !data.daily.temperature_2m_mean || data.daily.temperature_2m_mean[0] === null) {
    throw new Error("Could not retrieve today's temperature for this location.");
  }
  return data.daily.temperature_2m_mean[0];
}

async function getHistoricalAverage(lat, lon) {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');

  const decades = [1960, 1970, 1980, 1990, 2000, 2010];
  const temps = [];

  for (const year of decades) {
    const dateStr = `${year}-${month}-${day}`;
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${dateStr}&end_date=${dateStr}&daily=temperature_2m_mean&timezone=auto`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.daily && data.daily.temperature_2m_mean && data.daily.temperature_2m_mean[0] !== null) {
        temps.push(data.daily.temperature_2m_mean[0]);
      }
    } catch (e) {
      // skip this decade if it fails
    }
  }

  if (temps.length === 0) throw new Error("Could not retrieve historical temperature data for this location.");
  return temps.reduce((a, b) => a + b, 0) / temps.length;
}

async function getPainting(artistName) {
  const searchUrl = `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&medium=Paintings&q=${encodeURIComponent(artistName)}`;
  const res = await fetch(searchUrl);
  const data = await res.json();

  if (!data.objectIDs || data.objectIDs.length === 0) throw new Error("No paintings found for this artist.");

  // try up to 10 random results to find one with an image
  const shuffled = data.objectIDs.sort(() => Math.random() - 0.5).slice(0, 10);
  for (const id of shuffled) {
    const objRes = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`);
    const obj = await objRes.json();
    if (obj.primaryImageSmall && obj.primaryImageSmall !== '') {
      return obj;
    }
  }
  throw new Error("Could not find a painting with an image for this artist.");
}

async function run() {
  const address = document.getElementById('address').value.trim();
  if (!address) return;

  const loading = document.getElementById('loading');
  const error = document.getElementById('error');
  const result = document.getElementById('result');

  loading.style.display = 'block';
  error.style.display = 'none';
  result.style.display = 'none';

  try {
    const { lat, lon, name } = await geocode(address);
    loading.textContent = 'Found your location. Fetching temperatures...';

    const [todayTemp, historicalAvg] = await Promise.all([
      getTodayTemp(lat, lon),
      getHistoricalAverage(lat, lon)
    ]);

    const delta = todayTemp - historicalAvg;
    const painterEntry = getPainterForDelta(delta);

    loading.textContent = `Finding a ${painterEntry.artist} painting...`;
    const painting = await getPainting(painterEntry.artist);

    const sign = delta > 0 ? '+' : '';
    document.getElementById('delta-display').innerHTML = `
      Today is <span>${sign}${delta.toFixed(1)}°C</span> from the historical average for this date.<br>
      <small style="color:#666">${name.split(',').slice(0, 2).join(',')}</small>
    `;

    document.getElementById('painting-img').src = painting.primaryImageSmall;
    document.getElementById('painting-img').alt = painting.title;
    document.getElementById('painting-title').textContent = painting.title;
    document.getElementById('painting-artist').textContent = `${painting.artistDisplayName || painterEntry.artist} · ${painting.objectDate || ''}`;
    document.getElementById('painting-caption').textContent = painterEntry.caption;

    loading.style.display = 'none';
    result.style.display = 'block';

  } catch (err) {
    loading.style.display = 'none';
    error.style.display = 'block';
    error.textContent = err.message;
  }
}

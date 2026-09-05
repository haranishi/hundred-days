const DATA_URLS = {
  osm: './data/osm-wifi.json',
  chain: './data/osm-chains.json',
  municipal: './data/municipal.json',
};

async function fetchJson(url, fetchFn) {
  const response = await fetchFn(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`data ${response.status}`);
  return response.json();
}

export async function fetchDatasets(fetchFn = fetch) {
  const [osm, chain, municipal] = await Promise.all([
    fetchJson(DATA_URLS.osm, fetchFn),
    fetchJson(DATA_URLS.chain, fetchFn),
    fetchJson(DATA_URLS.municipal, fetchFn),
  ]);
  if (!Array.isArray(osm?.spots) || !Array.isArray(chain?.spots)
    || !Array.isArray(chain?.chains) || !Array.isArray(municipal?.spots)
    || !Array.isArray(municipal?.sources)) throw new Error('invalid data');
  return { osm, chain, municipal };
}

export { DATA_URLS };

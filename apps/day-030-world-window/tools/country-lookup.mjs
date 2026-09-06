function unwrapRing(ring) {
  if (!ring.length) return [];
  const output = [[ring[0][0], ring[0][1]]];
  for (let index = 1; index < ring.length; index += 1) {
    let longitude = ring[index][0];
    const previous = output[index - 1][0];
    while (longitude - previous > 180) longitude -= 360;
    while (longitude - previous < -180) longitude += 360;
    output.push([longitude, ring[index][1]]);
  }
  return output;
}

function ringContains(ring, lat, lon) {
  if (ring.length < 3) return false;
  const unwrapped = unwrapRing(ring);
  let longitude = lon;
  while (longitude - unwrapped[0][0] > 180) longitude -= 360;
  while (longitude - unwrapped[0][0] < -180) longitude += 360;
  let inside = false;
  for (let index = 0, previous = unwrapped.length - 1; index < unwrapped.length; previous = index, index += 1) {
    const [xi, yi] = unwrapped[index];
    const [xj, yj] = unwrapped[previous];
    if ((yi > lat) !== (yj > lat) && longitude < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function polygonContains(polygon, lat, lon) {
  return ringContains(polygon[0] || [], lat, lon)
    && polygon.slice(1).every((hole) => !ringContains(hole, lat, lon));
}

function polygonHoleContains(polygon, lat, lon) {
  return polygon.slice(1).some((hole) => ringContains(hole, lat, lon));
}

function polygonRecord(coordinates) {
  const rings = coordinates.map(unwrapRing);
  const points = rings.flat();
  return {
    coordinates,
    bbox: {
      west: Math.min(...points.map(([lon]) => lon)),
      east: Math.max(...points.map(([lon]) => lon)),
      south: Math.min(...points.map(([, lat]) => lat)),
      north: Math.max(...points.map(([, lat]) => lat)),
    },
  };
}

function longitudeNear(lon, reference) {
  let value = lon;
  while (value - reference > 180) value -= 360;
  while (value - reference < -180) value += 360;
  return value;
}

function nearBbox(bbox, lat, lon, margin) {
  const longitude = longitudeNear(lon, (bbox.west + bbox.east) / 2);
  return lat >= bbox.south - margin && lat <= bbox.north + margin
    && longitude >= bbox.west - margin && longitude <= bbox.east + margin;
}

function vertexDistance(polygon, lat, lon) {
  return Math.min(...polygon.coordinates[0].map(([vertexLon, vertexLat]) => {
    const longitude = longitudeNear(lon, vertexLon);
    return Math.hypot((longitude - vertexLon) * Math.cos(lat * Math.PI / 180), lat - vertexLat);
  }));
}

export function buildCountryIndex(geojson) {
  return (geojson?.features || []).flatMap((feature) => {
    const iso2 = String(feature.properties?.ISO_A2_EH || '');
    if (iso2 === '-99' || !/^[A-Z]{2}$/.test(iso2)) return [];
    const geometry = feature.geometry || {};
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates]
      : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
    return [{ iso2, polygons: polygons.map(polygonRecord) }];
  });
}

export function countryOf(index, lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return '';
  for (const country of index) {
    for (const polygon of country.polygons) {
      if (nearBbox(polygon.bbox, lat, lon, 0) && polygonContains(polygon.coordinates, lat, lon)) return country.iso2;
    }
  }

  let nearest = null;
  for (const country of index) {
    for (const polygon of country.polygons) {
      if (!nearBbox(polygon.bbox, lat, lon, 0.5)) continue;
      // 湖などの穴を沿岸補完で国土へ戻すと、GeoJSONの意図を失うため候補から外す。
      if (polygonHoleContains(polygon.coordinates, lat, lon)) continue;
      const distance = vertexDistance(polygon, lat, lon);
      if (!nearest || distance < nearest.distance) nearest = { iso2: country.iso2, distance };
    }
  }
  return nearest?.iso2 || '';
}

export function countryTable(geojson) {
  const table = {};
  for (const feature of geojson?.features || []) {
    const properties = feature.properties || {};
    const iso2 = String(properties.ISO_A2_EH || '');
    if (iso2 === '-99' || !/^[A-Z]{2}$/.test(iso2)) continue;
    table[iso2] = {
      ja: properties.NAME_JA || properties.NAME || '',
      en: properties.NAME || '',
      continent: properties.CONTINENT || '',
    };
  }
  return Object.fromEntries(Object.entries(table).sort(([left], [right]) => left.localeCompare(right)));
}

import { angleDiff, distanceMeters, METERS_PER_DEGREE_LAT } from './geo';
import type { Radar, RadarKind } from './types';

const KINDS = new Set<string>(['FIXED', 'SECTION', 'RED_LIGHT']);
/** Different sources often map the same camera a few dozen meters apart. */
const SAME_RADAR_METERS = 60;
const SAME_DIRECTION_DEGREES = 45;

function optionalNumber(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Parses Pardal's radares.csv, keeping only active radars. */
export function parseRadarCsv(csv: string): Radar[] {
  const lines = csv.split(/\r?\n/);
  const header = lines[0]?.split(',') ?? [];
  const column = (name: string) => header.indexOf(name);
  const [lat, lng, kind, limit, active, direction] = [
    column('lat'),
    column('lng'),
    column('kind'),
    column('limit_kmh'),
    column('active'),
    column('direction_deg'),
  ];
  if ([lat, lng, kind, limit, active, direction].some((index) => index < 0)) {
    throw new Error('Formato inesperado no arquivo de radares');
  }

  const radars: Radar[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const row = lines[i].split(',');
    const radarLat = Number(row[lat]);
    const radarLng = Number(row[lng]);
    if (row[active] !== '1' || !KINDS.has(row[kind])) continue;
    if (!Number.isFinite(radarLat) || !Number.isFinite(radarLng)) continue;
    radars.push({
      id: `${row[lat]},${row[lng]}`,
      lat: radarLat,
      lng: radarLng,
      kind: row[kind] as RadarKind,
      limitKmh: optionalNumber(row[limit]),
      directionDeg: optionalNumber(row[direction]),
    });
  }
  return radars;
}

function canMerge(a: Radar, b: Radar): boolean {
  if (a.kind !== b.kind) return false;
  if (a.directionDeg !== null && b.directionDeg !== null) {
    if (angleDiff(a.directionDeg, b.directionDeg) > SAME_DIRECTION_DEGREES) return false;
  }
  return distanceMeters(a.lat, a.lng, b.lat, b.lng) <= SAME_RADAR_METERS;
}

/**
 * Collapses records of one physical radar so it alerts once, keeping the most
 * useful data of each. When limits disagree the lowest one wins.
 */
export function mergeRadars(radars: Radar[]): Radar[] {
  const sorted = [...radars].sort((a, b) => a.lat - b.lat);
  const absorbed = new Set<number>();
  const window = SAME_RADAR_METERS / METERS_PER_DEGREE_LAT;
  const merged: Radar[] = [];

  for (let i = 0; i < sorted.length; i++) {
    if (absorbed.has(i)) continue;
    const current = { ...sorted[i] };
    for (let j = i + 1; j < sorted.length && sorted[j].lat - current.lat <= window; j++) {
      if (absorbed.has(j) || !canMerge(current, sorted[j])) continue;
      const other = sorted[j];
      absorbed.add(j);
      current.directionDeg ??= other.directionDeg;
      if (other.limitKmh !== null) {
        current.limitKmh =
          current.limitKmh === null ? other.limitKmh : Math.min(current.limitKmh, other.limitKmh);
      }
    }
    merged.push(current);
  }
  return merged;
}

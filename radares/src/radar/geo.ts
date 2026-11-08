const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

export const METERS_PER_DEGREE_LAT = 111_195;

export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function bearingDegrees(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Smallest absolute difference between two headings, 0-180. */
export function angleDiff(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/** Rounds down so the display never promises more room than there is. */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.floor(meters / 10) * 10} m`;
  return `${(Math.floor(meters / 100) / 10).toFixed(1).replace('.', ',')} km`;
}

export function spokenDistance(meters: number): string {
  if (meters < 1000) return `${Math.floor(meters / 10) * 10} metros`;
  const km = Math.floor(meters / 100) / 10;
  if (km === 1) return '1 quilômetro';
  return `${km.toFixed(1).replace('.', ',').replace(',0', '')} quilômetros`;
}

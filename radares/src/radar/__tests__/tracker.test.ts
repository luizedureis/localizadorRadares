import { describe, expect, it } from '@jest/globals';

import { bearingDegrees, distanceMeters, formatDistance } from '../geo';
import { mergeRadars, parseRadarCsv } from '../parse';
import { initialTrackerState, tick, type TrackerState } from '../tracker';
import type { Fix, Radar } from '../types';
import { statesAt } from '../uf-bounds';

const ORIGIN = { lat: -23.0, lng: -46.0 };
const METERS_PER_DEG = 111_195;
const lngMeters = METERS_PER_DEG * Math.cos((ORIGIN.lat * Math.PI) / 180);

/** Position `north` and `east` meters away from the origin. */
const at = (north: number, east = 0) => ({
  lat: ORIGIN.lat + north / METERS_PER_DEG,
  lng: ORIGIN.lng + east / lngMeters,
});

const radar = (north: number, east = 0, extra: Partial<Radar> = {}): Radar => ({
  id: `${north}:${east}`,
  ...at(north, east),
  kind: 'FIXED',
  limitKmh: 60,
  directionDeg: null,
  ...extra,
});

let clock = 0;
const fix = (north: number, east = 0, extra: Partial<Fix> = {}): Fix => ({
  ...at(north, east),
  speed: 20,
  heading: 0,
  accuracy: 8,
  timestamp: (clock += 1000),
  ...extra,
});

function drive(radars: Radar[], norths: number[], radius = 1000) {
  let state: TrackerState = initialTrackerState;
  return norths.map((north) => {
    const result = tick(state, fix(north), radars, radius);
    state = result.state;
    return result;
  });
}

describe('radar ahead filtering', () => {
  it('alerts on a radar straight ahead with the right distance and limit', () => {
    const [result] = drive([radar(800)], [0]);
    expect(result.event).toBe('new');
    expect(result.target?.radar.limitKmh).toBe(60);
    expect(result.target?.distance).toBeCloseTo(800, -1);
  });

  it('ignores a radar behind the car', () => {
    expect(drive([radar(-300)], [0])[0].target).toBeNull();
  });

  it('ignores a radar on a parallel road', () => {
    expect(drive([radar(500, 400)], [0])[0].target).toBeNull();
  });

  it('ignores a radar beyond the alert radius', () => {
    expect(drive([radar(1500)], [0])[0].target).toBeNull();
  });

  it('ignores a radar that enforces the opposite direction', () => {
    expect(drive([radar(500, 0, { directionDeg: 180 })], [0])[0].target).toBeNull();
  });

  it('confirms a radar that enforces my direction', () => {
    expect(drive([radar(500, 0, { directionDeg: 10 })], [0])[0].target?.directionConfirmed).toBe(
      true
    );
  });

  it('still alerts when the source gives no direction, without confirming it', () => {
    const [result] = drive([radar(500)], [0]);
    expect(result.target).not.toBeNull();
    expect(result.target?.directionConfirmed).toBe(false);
  });

  it('does not apply the direction filter on an imprecise fix', () => {
    const result = tick(
      initialTrackerState,
      fix(0, 0, { accuracy: 40 }),
      [radar(500, 0, { directionDeg: 180 })],
      1000
    );
    expect(result.target?.directionConfirmed).toBe(false);
  });

  it('picks the nearest of several radars ahead', () => {
    const [result] = drive([radar(900), radar(400)], [0]);
    expect(result.target?.distance).toBeCloseTo(400, -1);
  });
});

describe('tracking while approaching', () => {
  it('updates the distance and raises closer events once per threshold', () => {
    const results = drive([radar(1000)], [100, 300, 450, 550, 700, 850, 900]);
    expect(results.map((r) => r.event)).toEqual([
      'new',
      null,
      null,
      'closer',
      null,
      'closer',
      null,
    ]);
    const distances = results.map((r) => r.target!.distance);
    expect(distances).toEqual([...distances].sort((a, b) => b - a));
  });

  it('clears after passing and does not alert for the same radar again', () => {
    const results = drive([radar(500)], [100, 300, 480, 560, 640]);
    expect(results[3].event).toBe('cleared');
    expect(results[3].target).toBeNull();
    expect(results[4].event).toBeNull();
  });

  it('moves on to the next radar after passing one', () => {
    const results = drive([radar(300), radar(900)], [100, 280, 360]);
    expect(results[2].event).toBe('new');
    expect(results[2].target?.distance).toBeCloseTo(540, -1);
  });

  it('keeps the target while stopped at a light', () => {
    let state = initialTrackerState;
    state = tick(state, fix(0), [radar(400)], 1000).state;
    const stopped = tick(state, fix(0, 0, { speed: 0, heading: -1 }), [radar(400)], 1000);
    expect(stopped.target).not.toBeNull();
    expect(stopped.event).toBeNull();
  });
});

describe('course handling', () => {
  it('waits for movement before alerting', () => {
    const result = tick(
      initialTrackerState,
      fix(0, 0, { speed: 0, heading: -1 }),
      [radar(400)],
      1000
    );
    expect(result.hasCourse).toBe(false);
    expect(result.target).toBeNull();
  });

  it('derives the course from consecutive positions when the GPS has none', () => {
    let state = initialTrackerState;
    const radars = [radar(500)];
    state = tick(state, fix(0, 0, { heading: -1 }), radars, 1000).state;
    const second = tick(state, fix(30, 0, { heading: -1 }), radars, 1000);
    expect(second.target).not.toBeNull();
  });

  it('skips a fix with unusable accuracy', () => {
    const result = tick(initialTrackerState, fix(0, 0, { accuracy: 200 }), [radar(400)], 1000);
    expect(result.target).toBeNull();
  });
});

describe('data parsing', () => {
  const csv = [
    'lat,lng,kind,limit_kmh,source,active,end_lat,end_lng,direction_deg',
    '-25.056361,-48.555666,FIXED,60,ANTT+OSM,1,,,184',
    '-25.055900,-48.555543,FIXED,,OSM,1,,,',
    '-24.000000,-46.000000,RED_LIGHT,,OSM,0,,,',
    '-23.500000,-46.500000,SECTION,80,DER-SP,1,-23.6,-46.6,',
    '',
  ].join('\n');

  it('keeps active radars and treats empty fields as unknown', () => {
    const radars = parseRadarCsv(csv);
    expect(radars).toHaveLength(3);
    expect(radars[1]).toMatchObject({ limitKmh: null, directionDeg: null });
    expect(radars[0]).toMatchObject({ limitKmh: 60, directionDeg: 184 });
  });

  it('rejects a file with an unexpected header', () => {
    expect(() => parseRadarCsv('404: Not Found')).toThrow();
  });

  it('merges records of one radar and keeps the known limit and direction', () => {
    const merged = mergeRadars(parseRadarCsv(csv));
    expect(merged).toHaveLength(2);
    expect(merged.find((r) => r.kind === 'FIXED')).toMatchObject({
      limitKmh: 60,
      directionDeg: 184,
    });
  });

  it('does not merge radars of opposite carriageways', () => {
    const merged = mergeRadars([
      radar(0, 0, { directionDeg: 0 }),
      radar(20, 0, { directionDeg: 180 }),
    ]);
    expect(merged).toHaveLength(2);
  });
});

describe('helpers', () => {
  it('formats distances in pt-BR, rounding down', () => {
    expect(formatDistance(857)).toBe('850 m');
    expect(formatDistance(1290)).toBe('1,2 km');
  });

  it('computes bearing and distance', () => {
    const north = at(1000);
    expect(bearingDegrees(ORIGIN.lat, ORIGIN.lng, north.lat, north.lng)).toBeCloseTo(0, 3);
    expect(distanceMeters(ORIGIN.lat, ORIGIN.lng, north.lat, north.lng)).toBeCloseTo(1000, 0);
  });

  it('finds the state for a position, including neighbors near a border', () => {
    expect(statesAt(-23.55, -46.63)).toEqual(['SP']);
    expect(statesAt(-22.9, -44.9)).toEqual(expect.arrayContaining(['SP', 'MG', 'RJ']));
  });
});

import { angleDiff, bearingDegrees, distanceMeters, METERS_PER_DEGREE_LAT } from './geo';
import type { Fix, Radar, Target } from './types';

/** Below ~9 km/h the GPS course is noise. */
const MIN_MOVING_SPEED = 2.5;
const MIN_ANCHOR_MOVE = 15;
const COURSE_MEMORY_MS = 5 * 60_000;
/** Pardal's guidance: only trust the direction with a fix this good. */
const PRECISE_ACCURACY = 15;
const MAX_USABLE_ACCURACY = 65;
const MAX_DIRECTION_DIFF = 60;
const MIN_ACQUIRE_DISTANCE = 30;
const CLOSE_RANGE = 40;
const MOVING_AWAY_MARGIN = 80;
const PASSED_COOLDOWN_MS = 3 * 60_000;

export type TrackerState = {
  course: number | null;
  courseAt: number;
  anchor: Fix | null;
  target: Radar | null;
  minDistance: number;
  stage: number;
  cooldowns: Record<string, number>;
};

export type TrackerEvent = 'new' | 'closer' | 'cleared' | null;

export type TickResult = {
  state: TrackerState;
  target: Target | null;
  event: TrackerEvent;
  /** False until the first movement gives a usable course. */
  hasCourse: boolean;
};

export const initialTrackerState: TrackerState = {
  course: null,
  courseAt: 0,
  anchor: null,
  target: null,
  minDistance: Infinity,
  stage: 0,
  cooldowns: {},
};

/** Tolerated distance from the line of travel. Grows with range because roads bend. */
export function corridorMeters(distance: number): number {
  return 60 + 0.08 * distance;
}

function stageFor(distance: number): number {
  if (distance <= 200) return 2;
  if (distance <= 500) return 1;
  return 0;
}

function resolveCourse(state: TrackerState, fix: Fix) {
  const reported = fix.heading !== null && fix.heading >= 0 ? fix.heading : null;
  const anchor = state.anchor;
  const moved = anchor ? distanceMeters(anchor.lat, anchor.lng, fix.lat, fix.lng) : 0;
  const anchorMoved = !anchor || moved >= MIN_ANCHOR_MOVE;
  const nextAnchor = anchorMoved ? fix : anchor;

  if (fix.speed !== null && fix.speed >= MIN_MOVING_SPEED && reported !== null) {
    return { course: reported, courseAt: fix.timestamp, moving: true, anchor: nextAnchor };
  }

  if (anchor && moved >= MIN_ANCHOR_MOVE) {
    const seconds = (fix.timestamp - anchor.timestamp) / 1000;
    if (seconds > 0 && moved / seconds >= MIN_MOVING_SPEED) {
      const course = bearingDegrees(anchor.lat, anchor.lng, fix.lat, fix.lng);
      return { course, courseAt: fix.timestamp, moving: true, anchor: nextAnchor };
    }
  }

  const fresh = fix.timestamp - state.courseAt <= COURSE_MEMORY_MS;
  return {
    course: fresh ? state.course : null,
    courseAt: state.courseAt,
    moving: false,
    anchor: nextAnchor,
  };
}

function isPrecise(fix: Fix): boolean {
  return fix.accuracy !== null && fix.accuracy <= PRECISE_ACCURACY;
}

function findAhead(
  radars: Radar[],
  fix: Fix,
  course: number,
  radius: number,
  cooldowns: Record<string, number>
): Target | null {
  const latWindow = radius / METERS_PER_DEGREE_LAT;
  const precise = isPrecise(fix);
  let best: Target | null = null;

  for (const radar of radars) {
    if (Math.abs(radar.lat - fix.lat) > latWindow) continue;
    const distance = distanceMeters(fix.lat, fix.lng, radar.lat, radar.lng);
    if (distance > radius || distance < MIN_ACQUIRE_DISTANCE) continue;
    if (best && distance >= best.distance) continue;
    if (cooldowns[radar.id]) continue;

    const relative = angleDiff(course, bearingDegrees(fix.lat, fix.lng, radar.lat, radar.lng));
    if (relative >= 90) continue;
    if (distance * Math.sin((relative * Math.PI) / 180) > corridorMeters(distance)) continue;

    let directionConfirmed = false;
    if (radar.directionDeg !== null && precise) {
      if (angleDiff(course, radar.directionDeg) > MAX_DIRECTION_DIFF) continue;
      directionConfirmed = true;
    }
    best = { radar, distance, directionConfirmed };
  }
  return best;
}

function isStillAhead(relative: number, distance: number, minDistance: number): boolean {
  if (distance > minDistance + MOVING_AWAY_MARGIN) return false;
  return relative <= 70 || (distance < CLOSE_RANGE && relative <= 100);
}

/**
 * Advances the tracker with one GPS fix. Pure: every side effect (notification,
 * voice, Live Activity) is decided by the caller from the returned event.
 */
export function tick(
  previous: TrackerState,
  fix: Fix,
  radars: Radar[],
  radius: number
): TickResult {
  const hadTarget = previous.target !== null;

  if (fix.accuracy !== null && fix.accuracy > MAX_USABLE_ACCURACY) {
    const target = previous.target
      ? {
          radar: previous.target,
          distance: distanceMeters(fix.lat, fix.lng, previous.target.lat, previous.target.lng),
          directionConfirmed: false,
        }
      : null;
    return { state: previous, target, event: null, hasCourse: previous.course !== null };
  }

  const { course, courseAt, moving, anchor } = resolveCourse(previous, fix);
  const cooldowns: Record<string, number> = {};
  for (const [id, until] of Object.entries(previous.cooldowns)) {
    if (until > fix.timestamp) cooldowns[id] = until;
  }

  const base = { ...previous, course, courseAt, anchor, cooldowns };
  const hasCourse = course !== null;

  if (previous.target && course !== null) {
    const radar = previous.target;
    const distance = distanceMeters(fix.lat, fix.lng, radar.lat, radar.lng);
    const relative = angleDiff(course, bearingDegrees(fix.lat, fix.lng, radar.lat, radar.lng));

    if (!moving || isStillAhead(relative, distance, previous.minDistance)) {
      const stage = Math.max(previous.stage, stageFor(distance));
      const directionConfirmed =
        radar.directionDeg !== null &&
        isPrecise(fix) &&
        angleDiff(course, radar.directionDeg) <= MAX_DIRECTION_DIFF;
      return {
        state: { ...base, minDistance: Math.min(previous.minDistance, distance), stage },
        target: { radar, distance, directionConfirmed },
        event: stage > previous.stage ? 'closer' : null,
        hasCourse,
      };
    }

    if (previous.minDistance < 150) {
      cooldowns[radar.id] = fix.timestamp + PASSED_COOLDOWN_MS;
    }
  }

  // A stationary phone keeps its old course, which is too weak to pick a new radar.
  const found = moving && course !== null ? findAhead(radars, fix, course, radius, cooldowns) : null;

  if (found) {
    return {
      state: {
        ...base,
        target: found.radar,
        minDistance: found.distance,
        stage: stageFor(found.distance),
      },
      target: found,
      event: 'new',
      hasCourse,
    };
  }

  return {
    state: { ...base, target: null, minDistance: Infinity, stage: 0 },
    target: null,
    event: hadTarget ? 'cleared' : null,
    hasCourse,
  };
}

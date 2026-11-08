import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as Speech from 'expo-speech';
import { File, Paths } from 'expo-file-system';
import { AppState } from 'react-native';
import type { LiveActivity } from 'expo-widgets';

import { RadarActivity, type RadarActivityProps } from '@/widgets/radar-activity';
import { RadarWidget } from '@/widgets/radar-widget';

import { ensureRadarsAt, getDataSummary, getRadars } from './data';
import { formatDistance, spokenDistance } from './geo';
import { initialTrackerState, tick, type TrackerEvent } from './tracker';
import type { Fix, Radar, RadarKind, Target } from './types';

export const LOCATION_TASK = 'radar-location-task';

const NOTIFICATION_ID = 'radar-alert';
const DATA_CHECK_INTERVAL_MS = 60_000;
const ACTIVITY_THROTTLE_MS = 2_000;
const WIDGET_THROTTLE_MS = 30_000;

export const RADIUS_OPTIONS = [500, 1000, 2000] as const;

export type Settings = { radius: number; voice: boolean };

export type MonitorSnapshot = {
  running: boolean;
  target: Target | null;
  speedKmh: number | null;
  waitingForMovement: boolean;
  data: ReturnType<typeof getDataSummary>;
  settings: Settings;
};

export type StartResult = 'ok' | 'location-denied' | 'background-denied' | 'data-failed';

const KIND_LABELS: Record<RadarKind, string> = {
  FIXED: 'Radar fixo',
  SECTION: 'Radar de trecho',
  RED_LIGHT: 'Radar de semáforo',
};

export const kindLabel = (radar: Radar) => KIND_LABELS[radar.kind];
const limitText = (radar: Radar) =>
  radar.limitKmh === null ? 'Limite não informado' : `Limite ${radar.limitKmh} km/h`;

const settingsFile = () => new File(Paths.document, 'settings.json');

function readSettings(): Settings {
  const defaults: Settings = { radius: 1000, voice: true };
  try {
    const file = settingsFile();
    return file.exists ? { ...defaults, ...JSON.parse(file.textSync()) } : defaults;
  } catch {
    return defaults;
  }
}

let snapshot: MonitorSnapshot = {
  running: false,
  target: null,
  speedKmh: null,
  waitingForMovement: true,
  data: getDataSummary(),
  settings: readSettings(),
};
const listeners = new Set<() => void>();

function emit(patch: Partial<MonitorSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((listener) => listener());
}

export const getSnapshot = () => snapshot;
export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function updateSettings(patch: Partial<Settings>) {
  const settings = { ...snapshot.settings, ...patch };
  emit({ settings });
  try {
    settingsFile().write(JSON.stringify(settings));
  } catch {
    // The choice still applies to this session.
  }
}

let tracker = initialTrackerState;
let activity: LiveActivity<RadarActivityProps> | null = null;
let lastDataCheck = 0;
let lastActivityUpdate = 0;
let lastActivityDistance = '';
let lastWidgetUpdate = 0;

const IDLE_ACTIVITY: RadarActivityProps = {
  title: 'Monitorando',
  distance: 'Livre',
  limit: 'Nenhum radar à frente',
  alert: false,
};

function activityProps(target: Target): RadarActivityProps {
  return {
    title: kindLabel(target.radar),
    distance: formatDistance(target.distance),
    limit: limitText(target.radar),
    alert: true,
  };
}

function ignoreFailure(promise: Promise<unknown>) {
  promise.catch(() => {
    // Display surfaces are best effort and must never stop the tracking loop.
  });
}

function updateWidget(title: string, detail: string, alert: boolean) {
  const updatedAt = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  try {
    RadarWidget.updateSnapshot({ title, detail, updatedAt, alert });
    lastWidgetUpdate = Date.now();
  } catch {
    // Widgets are optional.
  }
}

function announce(target: Target) {
  const limit =
    target.radar.limitKmh === null
      ? ''
      : ` Limite ${target.radar.limitKmh} quilômetros por hora.`;

  if (AppState.currentState === 'active') {
    if (snapshot.settings.voice) {
      Speech.speak(`Radar a ${spokenDistance(target.distance)}.${limit}`, { language: 'pt-BR' });
    }
    return;
  }

  ignoreFailure(
    Notifications.scheduleNotificationAsync({
      identifier: NOTIFICATION_ID,
      content: {
        title: `Radar a ${formatDistance(target.distance)}`,
        body: `${kindLabel(target.radar)} à frente · ${limitText(target.radar)}`,
        sound: 'default',
      },
      trigger: null,
    })
  );
}

function applySurfaces(target: Target | null, event: TrackerEvent) {
  if (event === 'new' || event === 'closer') announce(target!);
  if (event === 'cleared') ignoreFailure(Notifications.dismissNotificationAsync(NOTIFICATION_ID));

  const now = Date.now();
  if (activity) {
    const props = target ? activityProps(target) : IDLE_ACTIVITY;
    const changed = event !== null || props.distance !== lastActivityDistance;
    if (changed && (event !== null || now - lastActivityUpdate >= ACTIVITY_THROTTLE_MS)) {
      lastActivityUpdate = now;
      lastActivityDistance = props.distance;
      ignoreFailure(activity.update(props));
    }
  }

  // WidgetKit rations reloads, so only state changes reach the home screen.
  if ((event === 'new' || event === 'cleared') && now - lastWidgetUpdate >= WIDGET_THROTTLE_MS) {
    if (target) {
      updateWidget(
        `${formatDistance(target.distance)} até o radar`,
        limitText(target.radar),
        true
      );
    } else {
      updateWidget('Monitorando', 'Nenhum radar à frente', false);
    }
  }
}

/** Runs for every location batch delivered by the background task. */
export async function processLocations(locations: Location.LocationObject[]) {
  const latest = locations[locations.length - 1];
  if (!latest) return;
  const { latitude, longitude, speed, heading, accuracy } = latest.coords;

  const now = Date.now();
  if (getRadars().length === 0 || now - lastDataCheck >= DATA_CHECK_INTERVAL_MS) {
    lastDataCheck = now;
    try {
      await ensureRadarsAt(latitude, longitude);
    } catch {
      // No data yet and no network: the next check retries.
    }
  }

  const fix: Fix = {
    lat: latitude,
    lng: longitude,
    speed,
    heading,
    accuracy,
    timestamp: latest.timestamp,
  };
  const result = tick(tracker, fix, getRadars(), snapshot.settings.radius);
  tracker = result.state;

  applySurfaces(result.target, result.event);
  emit({
    running: true,
    target: result.target,
    speedKmh: speed !== null && speed >= 0 ? Math.round(speed * 3.6) : null,
    waitingForMovement: !result.hasCourse,
    data: getDataSummary(),
  });
}

function startActivity() {
  // iOS only allows starting a Live Activity while the app is in the foreground.
  try {
    activity = RadarActivity.getInstances()[0] ?? RadarActivity.start(IDLE_ACTIVITY, 'radares://');
  } catch {
    activity = null;
  }
}

export async function startMonitoring(): Promise<StartResult> {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (!foreground.granted) return 'location-denied';
  const background = await Location.requestBackgroundPermissionsAsync();
  if (!background.granted) return 'background-denied';
  await Notifications.requestPermissionsAsync();

  const position =
    (await Location.getLastKnownPositionAsync()) ??
    (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
  try {
    await ensureRadarsAt(position.coords.latitude, position.coords.longitude);
    lastDataCheck = Date.now();
  } catch {
    return 'data-failed';
  }

  tracker = initialTrackerState;
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    activityType: Location.ActivityType.AutomotiveNavigation,
    distanceInterval: 10,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
  });

  startActivity();
  updateWidget('Monitorando', 'Nenhum radar à frente', false);
  emit({ running: true, target: null, waitingForMovement: true, data: getDataSummary() });
  return 'ok';
}

export async function stopMonitoring() {
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
  Speech.stop();
  tracker = initialTrackerState;
  ignoreFailure(Notifications.dismissNotificationAsync(NOTIFICATION_ID));
  for (const instance of RadarActivity.getInstances()) {
    ignoreFailure(instance.end('immediate'));
  }
  activity = null;
  updateWidget('Radares', 'Monitoramento desligado', false);
  emit({ running: false, target: null, speedKmh: null, waitingForMovement: true });
}

/** Reattaches the UI and Live Activity after the app process was relaunched. */
export async function syncMonitoring() {
  const running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  if (running) {
    try {
      activity = RadarActivity.getInstances()[0] ?? null;
    } catch {
      activity = null;
    }
  }
  emit({ running });
}

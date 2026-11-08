import { Directory, File, Paths } from 'expo-file-system';

import { mergeRadars, parseRadarCsv } from './parse';
import type { Radar } from './types';
import { statesAt } from './uf-bounds';

const BASE_URL = 'https://raw.githubusercontent.com/murkiriel/pardal/main/estados';
const REFRESH_AFTER_MS = 24 * 60 * 60_000;

type StateData = { radars: Radar[]; updatedAt: number };

const loaded = new Map<string, StateData>();
const refreshing = new Set<string>();
let merged: Radar[] = [];

function folder(): Directory {
  const directory = new Directory(Paths.document, 'radares');
  if (!directory.exists) directory.create({ intermediates: true });
  return directory;
}

const cacheFile = (uf: string) => new File(folder(), `${uf}.csv`);

function publish() {
  merged = mergeRadars([...loaded.values()].flatMap((state) => state.radars));
}

async function readCache(uf: string): Promise<boolean> {
  const file = cacheFile(uf);
  if (!file.exists) return false;
  try {
    const radars = parseRadarCsv(await file.text());
    loaded.set(uf, { radars, updatedAt: file.modificationTime ?? 0 });
    return true;
  } catch {
    return false;
  }
}

async function download(uf: string): Promise<void> {
  const response = await fetch(`${BASE_URL}/${uf}/radares.csv`);
  if (!response.ok) throw new Error(`HTTP ${response.status} ao baixar ${uf}`);
  const csv = await response.text();
  // Parse before writing, so a bad response never replaces a good cache.
  const radars = parseRadarCsv(csv);
  cacheFile(uf).write(csv);
  loaded.set(uf, { radars, updatedAt: Date.now() });
}

function refreshInBackground(uf: string) {
  if (refreshing.has(uf)) return;
  refreshing.add(uf);
  download(uf)
    .then(publish)
    .catch(() => {
      // Offline or GitHub unavailable: the cached copy keeps working.
    })
    .finally(() => refreshing.delete(uf));
}

/**
 * Makes sure the states around a position are in memory. Only rejects when a
 * state has neither a cached copy nor a successful download.
 */
export async function ensureRadarsAt(lat: number, lng: number): Promise<void> {
  let changed = false;
  let failure: unknown = null;

  for (const uf of statesAt(lat, lng)) {
    if (!loaded.has(uf)) {
      if (await readCache(uf)) {
        changed = true;
      } else {
        try {
          await download(uf);
          changed = true;
        } catch (error) {
          failure = error;
        }
      }
    }
    const state = loaded.get(uf);
    if (state && Date.now() - state.updatedAt > REFRESH_AFTER_MS) refreshInBackground(uf);
  }

  if (changed) publish();
  if (failure && merged.length === 0) throw failure;
}

export const getRadars = () => merged;

export function getDataSummary() {
  const states = [...loaded.entries()];
  return {
    states: states.map(([uf]) => uf).sort(),
    count: merged.length,
    oldestUpdate: states.length ? Math.min(...states.map(([, state]) => state.updatedAt)) : null,
  };
}

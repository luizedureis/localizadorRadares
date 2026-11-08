import type { LocationObject } from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { LOCATION_TASK, processLocations } from './monitor';

TaskManager.defineTask<{ locations: LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data) return;
  await processLocations(data.locations);
});

import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

/** Expo Go and the web have no background location, widgets or Live Activities. */
export const foregroundOnly =
  Platform.OS === 'web' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

type Surfaces = {
  activity: typeof import('@/widgets/radar-activity').RadarActivity;
  widget: typeof import('@/widgets/radar-widget').RadarWidget;
};

function load(): Surfaces | null {
  if (foregroundOnly) return null;
  // Lazy on purpose: importing expo-widgets throws where its native module is missing.
  return {
    activity: require('@/widgets/radar-activity').RadarActivity,
    widget: require('@/widgets/radar-widget').RadarWidget,
  };
}

export const surfaces = load();

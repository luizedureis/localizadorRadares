export type RadarKind = 'FIXED' | 'SECTION' | 'RED_LIGHT';

export type Radar = {
  id: string;
  lat: number;
  lng: number;
  kind: RadarKind;
  /** km/h. Null when the source does not state a limit. */
  limitKmh: number | null;
  /** Heading of the enforced traffic, 0-359. Null means both ways or not stated. */
  directionDeg: number | null;
};

export type Fix = {
  lat: number;
  lng: number;
  /** m/s. Null or negative when the device has no reading. */
  speed: number | null;
  /** GPS course over ground, 0-359. Null or negative when invalid. */
  heading: number | null;
  /** Horizontal accuracy in meters. */
  accuracy: number | null;
  timestamp: number;
};

export type Target = {
  radar: Radar;
  distance: number;
  /** True only when the radar has a direction and it was checked against a precise fix. */
  directionConfirmed: boolean;
};

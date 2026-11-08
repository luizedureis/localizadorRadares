/** [south, west, north, east] of each state, from Pardal's catalogo.json. */
export const UF_BOUNDS: Record<string, [number, number, number, number]> = {
  AC: [-11.15, -74.02, -7.11, -66.62],
  AL: [-10.51, -38.24, -8.81, -35.15],
  AM: [-9.82, -73.8, 2.25, -56.1],
  AP: [-1.24, -54.88, 4.44, -49.87],
  BA: [-18.35, -46.62, -8.53, -37.34],
  CE: [-7.86, -41.42, -2.78, -37.25],
  DF: [-16.05, -48.29, -15.5, -47.31],
  ES: [-21.3, -41.88, -17.89, -39.66],
  GO: [-19.5, -53.25, -12.4, -45.9],
  MA: [-10.26, -48.75, -1.04, -41.8],
  MG: [-22.92, -51.05, -14.23, -39.86],
  MS: [-24.07, -58.17, -17.16, -50.92],
  MT: [-18.04, -61.63, -7.35, -50.22],
  PA: [-9.84, -58.9, 2.59, -46.06],
  PB: [-8.3, -38.77, -6.02, -34.79],
  PE: [-9.48, -41.36, -7.27, -34.81],
  PI: [-10.93, -45.99, -2.74, -40.37],
  PR: [-26.72, -54.62, -22.52, -48.02],
  RJ: [-23.37, -44.89, -20.76, -40.96],
  RN: [-6.99, -38.58, -4.83, -34.96],
  RO: [-13.69, -66.81, -7.97, -59.77],
  RR: [-1.58, -64.82, 5.27, -58.89],
  RS: [-33.75, -57.65, -27.08, -49.69],
  SC: [-29.36, -53.84, -25.95, -48.35],
  SE: [-11.57, -38.25, -9.51, -36.39],
  SP: [-25.31, -53.11, -19.78, -44.16],
  TO: [-13.47, -50.74, -5.17, -45.7],
};

/** ~5 km, so the neighbor state is ready before the driver crosses the border. */
const BORDER_MARGIN_DEGREES = 0.05;

/** Every state whose bounding box holds the point. Bounding boxes overlap near borders. */
export function statesAt(lat: number, lng: number): string[] {
  const m = BORDER_MARGIN_DEGREES;
  return Object.keys(UF_BOUNDS).filter((uf) => {
    const [south, west, north, east] = UF_BOUNDS[uf];
    return lat >= south - m && lat <= north + m && lng >= west - m && lng <= east + m;
  });
}

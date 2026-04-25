export interface LocationsProps {
  name?: string;
  // latitude , longitude
  point: [number, number];
  // Southwest lat, South West Lng, North East lat,  North East lng
  boundaryBox?: string | {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  zoom?: number;
  marker?: boolean;
}

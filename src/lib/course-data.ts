export interface HoleData {
  number: number;
  par: number;
  handicap: number;
  yards: number;
  overheadImageUrl: string | null;
  greenImageUrl: string | null;
  holeName?: string | null;
  teeColor?: string | null;
  teeLatitude?: number | null;
  teeLongitude?: number | null;
  greenLatitude?: number | null;
  greenLongitude?: number | null;
  centerLine?: [number, number][] | null;
}

export interface TeeInfo {
  id: string;
  name: string;
  color: string | null;
  rating: number;
  slope: number;
  par: number;
}

export interface CourseData {
  name: string;
  club_name?: string | null;
  location: string;
  tees: TeeInfo[];
  holesByTee: Record<string, HoleData[]>;
  defaultTeeId: string;
}

export function getFrontNine(holes: HoleData[]): HoleData[] {
  return holes.filter((h) => h.number <= 9);
}

export function getBackNine(holes: HoleData[]): HoleData[] {
  return holes.filter((h) => h.number > 9);
}

export function getNinePar(holes: HoleData[]): number {
  return holes.reduce((sum, h) => sum + h.par, 0);
}

export function getNineYards(holes: HoleData[]): number {
  return holes.reduce((sum, h) => sum + h.yards, 0);
}

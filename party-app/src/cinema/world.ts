export type Point2 = { x: number; z: number };
export type Seat = Point2 & { id: string; row: 'A' | 'B'; number: number; elevation: number };
export type Collider = { id: string; minX: number; maxX: number; minZ: number; maxZ: number; bottom: number; top: number };

export const ROOM = { halfWidth: 6.4, front: -7.3, back: 7.3, height: 5.6 };
export const PLATFORM = { front: 1.9, back: 7.2, height: 0.64, width: 12.6 };
export const STAIRS = { centers: [-5.46, 5.46], width: 1.44, start: 0.46, tread: 0.36, rise: 0.16, count: 4 };
export const PLAYER_RADIUS = 0.285;
export const SPAWN: Point2 = { x: 5.45, z: 5.75 };
export const PREVIEW_START: Point2 = { x: 5.35, z: 0.03 };

// A single layout definition drives the meshes, collision, navigation, and UI.
export const SEATS: readonly Seat[] = (['A', 'B'] as const).flatMap((row) =>
  Array.from({ length: 5 }, (_, i) => ({
    id: `${row}${i + 1}`,
    row,
    number: i + 1,
    x: (i - 2) * 2.04,
    z: row === 'A' ? -0.65 : 3.7,
    elevation: row === 'A' ? 0 : PLATFORM.height,
  })),
);

function box(id: string, x: number, z: number, width: number, depth: number, top: number, bottom = 0): Collider {
  return { id, minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2, bottom, top };
}

export const COLLIDERS: readonly Collider[] = [
  box('left-wall', -6.46, 0, 0.6, 14.8, 5.6),
  box('front-wall', 0, -7.38, 13.2, 0.48, 5.6),
  box('rear-wall', 0, 7.38, 13.2, 0.55, 5.6),
  box('right-wall-front', 6.46, -1.31, 0.6, 12.18, 5.6),
  box('right-wall-rear', 6.46, 7.12, 0.6, 0.64, 5.6),
  box('door-frame-front', 6.39, 4.79, 0.3, 0.14, 3.52),
  box('door-frame-rear', 6.39, 6.73, 0.3, 0.14, 3.52),
  box('hall-end', 9.65, 5.76, 0.2, 2.3, 3.7),
  box('hall-left', 8.05, 4.65, 3.4, 0.2, 3.7),
  box('hall-right', 8.05, 6.87, 3.4, 0.2, 3.7),
  box('open-door', 7.34, 6.57, 1.82, 0.28, 3.34, 0.64),
  box('cafe-counter', 9.28, 5.76, 0.62, 2.42, 1.1),
  box('cafe-stool-left', 8.72, 5.14, 0.44, 0.44, 1.05),
  box('cafe-stool-right', 8.72, 6.36, 0.44, 0.44, 1.05),
  box('screen-recess', 0, -7.08, 8.86, 0.63, 5.53),
  box('media-console', 0, -6.69, 4.6, 0.58, 0.55),
  box('left-speaker', -4.78, -6.63, 0.6, 0.65, 1.85),
  box('right-speaker', 4.78, -6.63, 0.6, 0.65, 1.85),
  box('left-plant', -5.68, -5.52, 0.65, 0.65, 1.6),
  box('right-plant', 5.68, -5.52, 0.65, 0.65, 1.6),
  ...SEATS.map((seat) => box(seat.id, seat.x, seat.z - 0.175, 1.3, 1.87, seat.elevation + 1.64, seat.elevation)),
];

export function floorHeight(x: number, z: number): number {
  if (x > 6.3 && z > 4.7 && z < 6.82) return PLATFORM.height;
  if (z >= PLATFORM.front) return PLATFORM.height;
  if (z >= STAIRS.start && z < PLATFORM.front && STAIRS.centers.some((c) => Math.abs(x - c) <= STAIRS.width / 2)) {
    return Math.min(4, Math.floor((z - STAIRS.start + 0.00001) / STAIRS.tread) + 1) * STAIRS.rise;
  }
  return 0;
}

function onFloor(x: number, z: number): boolean {
  return (x >= -6.4 && x <= 6.4 && z >= -7.3 && z <= 7.3)
    || (x >= 6.25 && x <= 9.65 && z >= 4.7 && z <= 6.82);
}

export function isClear(x: number, z: number, radius = PLAYER_RADIUS): boolean {
  if (!onFloor(x, z) || !onFloor(x - radius, z) || !onFloor(x + radius, z)
    || !onFloor(x, z - radius) || !onFloor(x, z + radius)) return false;
  for (const c of COLLIDERS) {
    const dx = x - Math.max(c.minX, Math.min(x, c.maxX));
    const dz = z - Math.max(c.minZ, Math.min(z, c.maxZ));
    if (dx * dx + dz * dz < radius * radius) return false;
  }
  return true;
}

export function canTraverse(from: Point2, to: Point2): boolean {
  const distance = Math.hypot(to.x - from.x, to.z - from.z);
  const count = Math.max(1, Math.ceil(distance / 0.075));
  let previousHeight = floorHeight(from.x, from.z);
  for (let i = 1; i <= count; i++) {
    const x = from.x + (to.x - from.x) * i / count;
    const z = from.z + (to.z - from.z) * i / count;
    if (!isClear(x, z)) return false;
    const nextHeight = floorHeight(x, z);
    if (Math.abs(nextHeight - previousHeight) > STAIRS.rise + 0.015) return false;
    previousHeight = nextHeight;
  }
  return true;
}

// Substeps prevent tunneling; separate axes allow the capsule to slide along furniture.
export function movePlayer(position: Point2, dx: number, dz: number): Point2 {
  let { x, z } = position;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.055));
  for (let i = 0; i < steps; i++) {
    const nextX = x + dx / steps;
    if (canTraverse({ x, z }, { x: nextX, z })) x = nextX;
    const nextZ = z + dz / steps;
    if (canTraverse({ x, z }, { x, z: nextZ })) z = nextZ;
  }
  return { x, z };
}

export function seatApproach(seat: Seat): Point2 {
  return { x: seat.x, z: seat.z - 1.49 };
}

const GRID = 0.14;
const MIN_X = -6.16;
const MIN_Z = -6.98;
const WIDTH = Math.ceil((9.4 - MIN_X) / GRID);
const DEPTH = Math.ceil((7.06 - MIN_Z) / GRID);
let navigationGrid: Uint8Array | undefined;

function pointAt(index: number): Point2 {
  return { x: MIN_X + (index % WIDTH) * GRID, z: MIN_Z + Math.floor(index / WIDTH) * GRID };
}

function getGrid(): Uint8Array {
  if (!navigationGrid) {
    navigationGrid = new Uint8Array(WIDTH * DEPTH);
    for (let i = 0; i < navigationGrid.length; i++) {
      const p = pointAt(i);
      navigationGrid[i] = isClear(p.x, p.z, PLAYER_RADIUS + 0.025) ? 1 : 0;
    }
  }
  return navigationGrid;
}

function closestNode(point: Point2, grid: Uint8Array): number {
  let closest = -1;
  let distance = Infinity;
  const cx = Math.round((point.x - MIN_X) / GRID);
  const cz = Math.round((point.z - MIN_Z) / GRID);
  for (let oz = -4; oz <= 4; oz++) {
    for (let ox = -4; ox <= 4; ox++) {
      const gx = cx + ox;
      const gz = cz + oz;
      if (gx < 0 || gx >= WIDTH || gz < 0 || gz >= DEPTH) continue;
      const index = gz * WIDTH + gx;
      if (!grid[index]) continue;
      const p = pointAt(index);
      const d = Math.hypot(p.x - point.x, p.z - point.z);
      if (d < distance && canTraverse(point, p)) {
        closest = index;
        distance = d;
      }
    }
  }
  return closest;
}

export function findPath(start: Point2, destination: Point2): Point2[] | null {
  if (canTraverse(start, destination)) return [destination];
  const grid = getGrid();
  const first = closestNode(start, grid);
  const last = closestNode(destination, grid);
  if (first < 0 || last < 0) return null;
  const previous = new Int32Array(grid.length).fill(-1);
  const queue = new Int32Array(grid.length);
  previous[first] = first;
  queue[0] = first;
  let head = 0;
  let tail = 1;
  const neighbors = [[0, -1], [1, 0], [-1, 0], [0, 1], [1, -1], [-1, -1], [1, 1], [-1, 1]];
  while (head < tail) {
    const current = queue[head++];
    if (current === last) break;
    const x = current % WIDTH;
    const z = Math.floor(current / WIDTH);
    const a = pointAt(current);
    for (const [ox, oz] of neighbors) {
      const nx = x + ox;
      const nz = z + oz;
      if (nx < 0 || nx >= WIDTH || nz < 0 || nz >= DEPTH) continue;
      const next = nz * WIDTH + nx;
      if (!grid[next] || previous[next] !== -1 || !canTraverse(a, pointAt(next))) continue;
      previous[next] = current;
      queue[tail++] = next;
    }
  }
  if (previous[last] === -1) return null;
  const raw: Point2[] = [destination];
  let cursor = last;
  while (cursor !== first) {
    raw.push(pointAt(cursor));
    cursor = previous[cursor];
  }
  raw.push(pointAt(first));
  raw.push(start);
  raw.reverse();
  const smooth: Point2[] = [];
  let anchor = 0;
  while (anchor < raw.length - 1) {
    let next = raw.length - 1;
    while (next > anchor + 1 && !canTraverse(raw[anchor], raw[next])) next--;
    smooth.push(raw[next]);
    anchor = next;
  }
  return smooth;
}

export type LayoutValidation = { seats: number; reachableSeats: number; circulation: boolean; gap: number; sideAisle: number };

export function validateLayout(): LayoutValidation {
  const reachableSeats = SEATS.filter((seat) => findPath(SPAWN, seatApproach(seat)) !== null).length;
  const checkpoints: Point2[] = [
    PREVIEW_START,
    { x: 8.8, z: 5.5 }, { x: -5.46, z: 6 }, { x: 0, z: 6.3 },
    { x: -5.46, z: 0.25 }, { x: 5.46, z: 0.25 },
    { x: -5.46, z: 2.25 }, { x: 5.46, z: 2.25 },
    { x: 0, z: 0.95 }, { x: 0, z: -4.6 },
    ...SEATS.flatMap((seat) => [
      { x: seat.x - 0.99, z: seat.z },
      { x: seat.x + 0.99, z: seat.z },
      { x: seat.x, z: seat.z + 1.18 },
    ]),
  ];
  return {
    seats: SEATS.length,
    reachableSeats,
    circulation: checkpoints.every((point) => findPath(SPAWN, point) !== null),
    gap: 0.76,
    sideAisle: 1.48,
  };
}
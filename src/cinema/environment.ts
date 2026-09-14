import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { makeMaterials, labelTexture, posterTexture, softShadowTexture, type CinemaMaterials } from './materials';
import { buildNpcAvatar, makeDrinkCup } from './npcs';
import type { Avatar } from './avatar';
import { PLATFORM, ROOM, SEATS, STAIRS } from './world';

type XYZ = [number, number, number];

// Merge static architectural details by material rather than issuing hundreds of draw calls.
class GeometryBatch {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();

  add(geometry: THREE.BufferGeometry, material: THREE.Material, position: XYZ, rotation: XYZ = [0, 0, 0], scale: XYZ = [1, 1, 1]) {
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(...position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
      new THREE.Vector3(...scale),
    );
    const transformed = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    transformed.applyMatrix4(matrix);
    if (!this.parts.has(material)) this.parts.set(material, []);
    this.parts.get(material)!.push(transformed);
    geometry.dispose();
  }

  box(size: XYZ, position: XYZ, material: THREE.Material, radius = 0, rotation: XYZ = [0, 0, 0]) {
    const geometry = radius >= 0.015
      ? new RoundedBoxGeometry(...size, radius >= 0.025 ? 2 : 1, radius)
      : new THREE.BoxGeometry(...size);
    this.add(geometry, material, position, rotation);
  }

  finish(parent: THREE.Object3D) {
    for (const [material, parts] of this.parts) {
      const merged = mergeGeometries(parts, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      parent.add(mesh);
      parts.forEach((part) => part.dispose());
    }
    this.parts.clear();
  }
}

function makeChair(m: CinemaMaterials): THREE.Group {
  const chair = new THREE.Group();
  const b = new GeometryBatch();
  b.box([1.19, 0.15, 1.2], [0, 0.13, -0.04], m.black, 0.045);
  b.box([1.18, 0.28, 1.22], [0, 0.32, -0.05], m.leather, 0.07);
  b.box([0.9, 0.24, 0.88], [0, 0.53, -0.2], m.cushion, 0.085);
  b.box([1.02, 1.04, 0.3], [0, 1.08, 0.46], m.leather, 0.105, [0.1, 0, 0]);
  b.box([0.84, 0.69, 0.2], [0, 1.015, 0.29], m.cushion, 0.09, [0.1, 0, 0]);
  b.box([0.86, 0.31, 0.22], [0, 1.45, 0.33], m.cushion, 0.08, [0.1, 0, 0]);
  b.box([0.88, 0.2, 0.53], [0, 0.335, -0.84], m.cushion, 0.055, [-0.1, 0, 0]);
  b.box([0.81, 0.035, 0.43], [0, 0.206, -0.8], m.black, 0.012);

  for (const side of [-1, 1]) {
    b.box([0.235, 0.47, 1.28], [side * 0.52, 0.49, -0.13], m.leather, 0.085);
    b.box([0.235, 0.16, 1.2], [side * 0.52, 0.78, -0.13], m.cushion, 0.065);
    b.add(new THREE.CylinderGeometry(0.069, 0.059, 0.025, 20), m.metal, [side * 0.52, 0.867, -0.46]);
    b.add(new THREE.CylinderGeometry(0.052, 0.052, 0.006, 20), m.black, [side * 0.52, 0.882, -0.46]);
    b.add(new THREE.TorusGeometry(0.062, 0.009, 5, 20), m.brass, [side * 0.52, 0.884, -0.46], [Math.PI / 2, 0, 0]);
    b.box([0.014, 0.1, 0.18], [side * 0.646, 0.65, -0.39], m.metal, 0.006);
    b.add(new THREE.CylinderGeometry(0.024, 0.024, 0.019, 12), m.brass, [side * 0.655, 0.665, -0.42], [0, 0, Math.PI / 2]);
    b.box([0.009, 0.54, 0.009], [side * 0.349, 1.03, 0.176], m.piping, 0.003, [0.1, 0, 0]);
    b.box([0.008, 0.008, 0.63], [side * 0.351, 0.649, -0.19], m.piping, 0.003);
    b.box([0.009, 0.008, 0.81], [side * 0.594, 0.851, -0.11], m.piping, 0.003);
  }
  b.box([0.67, 0.009, 0.009], [0, 0.65, -0.58], m.piping, 0.003);
  b.box([0.67, 0.009, 0.009], [0, 1.306, 0.188], m.piping, 0.003);
  b.box([0.68, 0.009, 0.009], [0, 0.419, -1.018], m.piping, 0.003);
  b.box([0.12, 0.12, 0.021], [0, 1.05, 0.626], m.brass, 0.012);
  b.finish(chair);
  return chair;
}

function makeSpeaker(batch: GeometryBatch, x: number, m: CinemaMaterials) {
  batch.box([0.54, 1.73, 0.58], [x, 0.91, -6.63], m.black, 0.045);
  batch.box([0.47, 1.62, 0.025], [x, 0.91, -6.322], m.acousticDark, 0.01);
  batch.box([0.62, 0.085, 0.66], [x, 0.07, -6.63], m.metal, 0.02);
  for (const y of [0.48, 1.0, 1.45]) {
    const radius = y === 1.45 ? 0.085 : 0.165;
    batch.add(new THREE.TorusGeometry(radius, 0.014, 6, 28), m.metal, [x, y, -6.3]);
    batch.add(new THREE.CylinderGeometry(radius * 0.91, radius * 0.66, 0.036, 24), m.screenFrame, [x, y, -6.298], [Math.PI / 2, 0, 0]);
    batch.add(new THREE.SphereGeometry(radius * 0.38, 14, 8), m.black, [x, y, -6.275], [0, 0, 0], [1, 1, 0.24]);
  }
  batch.box([0.1, 0.017, 0.012], [x, 0.19, -6.31], m.brass);
}

function makePlant(batch: GeometryBatch, x: number, z: number, m: CinemaMaterials) {
  batch.add(new THREE.CylinderGeometry(0.29, 0.22, 0.52, 18), m.planter, [x, 0.27, z]);
  batch.add(new THREE.CylinderGeometry(0.263, 0.263, 0.02, 18), m.earth, [x, 0.527, z]);
  for (let i = 0; i < 17; i++) {
    const angle = i * 2.4;
    const height = 0.65 + (i % 5) * 0.15;
    const radius = 0.15 + (i % 3) * 0.06;
    batch.add(new THREE.CylinderGeometry(0.007, 0.008, height, 5), m.green, [x + Math.cos(angle) * radius * 0.5, 0.52 + height / 2, z + Math.sin(angle) * radius * 0.5], [Math.sin(angle) * 0.17, 0, Math.cos(angle) * 0.17]);
    batch.add(new THREE.SphereGeometry(1, 7, 5), m.green, [x + Math.cos(angle) * radius, 0.65 + height, z + Math.sin(angle) * radius], [0.5 * Math.sin(angle), angle, 0.4], [0.07, 0.29, 0.025]);
  }
}

function makePoster(scene: THREE.Scene, batch: GeometryBatch, side: number, z: number, variant: number, m: CinemaMaterials) {
  batch.box([0.1, 1.7, 1.14], [side * 6.225, 2.43, z], m.brass, 0.01);
  batch.box([0.13, 1.65, 1.09], [side * 6.2, 2.43, z], m.black, 0.005);
  const texture = posterTexture(variant ? 'ORBITAL' : 'THE QUIET|BETWEEN', variant ? 'SOME THINGS ARE WORTH FINDING.' : 'A FILM BY ELIAS NORTH', variant);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.02, 1.55), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.44, emissive: '#ffffff', emissiveMap: texture, emissiveIntensity: 0.035 }));
  plane.position.set(side * 6.119, 2.43, z);
  plane.rotation.y = -side * Math.PI / 2;
  scene.add(plane);
  batch.box([0.25, 0.04, 0.63], [side * 6.08, 3.39, z], m.metal, 0.015);
  batch.box([0.02, 0.018, 0.49], [side * 6.02, 3.36, z], m.fixture);
}

export type RoomLight = { light: THREE.Light; intensity: number };
export type CinemaEnvironment = {
  materials: CinemaMaterials;
  seats: THREE.Group[];
  cafeteria: { patrons: Avatar[]; barista: Avatar; walker: Avatar };
  screen: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  screenLight: THREE.RectAreaLight;
  screenShadow: THREE.SpotLight;
  faceLight: THREE.PointLight;
  roomLights: RoomLight[];
  ambient: THREE.HemisphereLight;
  shadowTexture: THREE.CanvasTexture;
  filmTexture: THREE.CanvasTexture;
  environmentTarget: THREE.WebGLRenderTarget;
  ready: Promise<void>;
};

export function buildEnvironment(scene: THREE.Scene, renderer: THREE.WebGLRenderer): CinemaEnvironment {
  RectAreaLightUniformsLib.init();
  const m = makeMaterials();
  const b = new GeometryBatch();
  const roomLights: RoomLight[] = [];
  const addRoomLight = (light: THREE.Light) => {
    roomLights.push({ light, intensity: light.intensity });
    scene.add(light);
  };

  const pmrem = new THREE.PMREMGenerator(renderer);
  const studio = new RoomEnvironment();
  const environmentTarget = pmrem.fromScene(studio, 0.06);
  scene.environment = environmentTarget.texture;
  scene.environmentIntensity = 0.22;
  studio.dispose();
  pmrem.dispose();

  b.box([12.95, 0.24, 14.8], [0, -0.125, 0], m.carpet);
  b.box([PLATFORM.width, PLATFORM.height, PLATFORM.back - PLATFORM.front], [0, PLATFORM.height / 2, (PLATFORM.back + PLATFORM.front) / 2], m.platform);
  b.box([9.28, 0.12, 0.11], [0, 0.575, PLATFORM.front - 0.035], m.wood);
  b.box([9.26, 0.022, 0.025], [0, 0.614, PLATFORM.front - 0.097], m.led);
  b.box([9.26, 0.045, 0.13], [0, 0.64, PLATFORM.front + 0.027], m.metal);
  for (const x of STAIRS.centers) {
    for (let i = 0; i < STAIRS.count; i++) {
      const height = (i + 1) * STAIRS.rise;
      const z = STAIRS.start + i * STAIRS.tread + STAIRS.tread / 2;
      b.box([STAIRS.width, height, STAIRS.tread], [x, height / 2, z], m.platform);
      b.box([STAIRS.width - 0.025, 0.025, 0.055], [x, height - 0.012, z - STAIRS.tread / 2 + 0.005], m.metal);
      b.box([STAIRS.width - 0.065, 0.017, 0.018], [x, height - 0.023, z - STAIRS.tread / 2 - 0.009], m.led);
    }
  }

  b.box([0.28, 5.6, 14.9], [-6.48, 2.8, 0], m.wall);
  b.box([0.28, 5.6, 12.18], [6.48, 2.8, -1.31], m.wall);
  b.box([0.28, 5.6, 0.64], [6.48, 2.8, 7.12], m.wall);
  b.box([0.28, 2.12, 2.08], [6.48, 4.54, 5.76], m.wall);
  b.box([13.2, 5.6, 0.24], [0, 2.8, -7.4], m.wall);
  b.box([13.2, 5.6, 0.24], [0, 2.8, 7.4], m.wall);

  for (const side of [-1, 1]) {
    b.box([0.1, 0.3, 14.5], [side * 6.28, 0.18, 0], m.wood);
    b.box([0.028, 0.016, 14.3], [side * 6.217, 0.344, 0], m.ledSoft);
    b.box([0.12, 0.12, 14.5], [side * 6.23, 4.8, 0], m.wood);
    for (let i = 0; i < 7; i++) {
      const z = -5.92 + i * 1.96;
      if (side > 0 && z > 4.4) continue;
      b.box([0.11, 3.52, 1.42], [side * 6.267, 2.7, z], i % 2 ? m.acousticDark : m.acoustic, 0.025);
      b.box([0.15, 3.61, 0.055], [side * 6.255, 2.7, z - 0.765], m.metal);
      b.box([0.15, 3.61, 0.055], [side * 6.255, 2.7, z + 0.765], m.metal);
      for (let j = 0; j < 5; j++) {
        b.box([0.115, 4.15, 0.037], [side * 6.228, 2.56, z + 0.85 + j * 0.068], m.wood);
      }
      if (i % 2 === 0) {
        const sconceZ = z + 0.85;
        b.box([0.13, 0.71, 0.13], [side * 6.137, 2.78, sconceZ], m.metal, 0.015);
        b.box([0.045, 0.53, 0.075], [side * 6.06, 2.78, sconceZ], m.led, 0.008);
        const sconce = new THREE.PointLight('#ffbf7d', 7.5, 4.1, 2);
        sconce.position.set(side * 5.98, 2.95, sconceZ);
        addRoomLight(sconce);
      }
    }
  }
  for (let i = 0; i < 49; i++) {
    b.box([0.065, 3.85, 0.115], [-6.13 + i * 0.255, 2.92, 7.225], m.wood);
  }
  b.box([12.65, 0.22, 0.15], [0, 0.76, 7.2], m.black);
  b.box([12.5, 0.018, 0.02], [0, 0.902, 7.1], m.ledSoft);

  b.box([13.2, 0.22, 14.9], [0, ROOM.height + 0.1, 0], m.ceiling);
  b.box([10.94, 0.17, 12.5], [0, 5.41, 0], m.ceilingInset, 0.02);
  b.box([10.6, 0.13, 12.1], [0, 5.31, 0], m.ceiling);
  for (const x of [-5.56, 5.56]) {
    b.box([0.13, 0.2, 12.82], [x, 5.35, 0], m.wood);
    b.box([0.023, 0.031, 12.84], [x + Math.sign(x) * 0.083, 5.406, 0], m.led);
    b.box([0.065, 0.028, 12.88], [x + Math.sign(x) * 0.13, 5.43, 0], m.ledSoft);
  }
  for (const z of [-6.43, 6.43]) {
    b.box([11.24, 0.2, 0.13], [0, 5.35, z], m.wood);
    b.box([11.38, 0.031, 0.023], [0, 5.406, z + Math.sign(z) * 0.082], m.led);
  }
  for (const z of [-3.15, 1.6]) {
    b.box([10.54, 0.14, 0.12], [0, 5.21, z], m.black);
  }
  for (const x of [-5.94, 5.94]) {
    for (const z of [-4.8, -0.8, 3.2, 6.25]) {
      b.add(new THREE.CylinderGeometry(0.13, 0.13, 0.045, 20), m.black, [x, 5.44, z]);
      b.add(new THREE.CylinderGeometry(0.074, 0.074, 0.011, 20), m.fixture, [x, 5.408, z]);
    }
  }

  // The display sits inside a layered architectural recess, at an exact 16:9 ratio.
  b.box([8.86, 5.2, 0.2], [0, 2.93, -7.185], m.wood);
  b.box([8.69, 5.06, 0.06], [0, 2.93, -7.064], m.ledSoft);
  b.box([8.51, 4.9, 0.32], [0, 2.93, -7.02], m.screenFrame);
  for (const x of [-4.024, 4.024]) b.box([0.2, 4.55, 0.19], [x, 2.93, -6.85], m.black);
  for (const y of [0.663, 5.197]) b.box([8.25, 0.16, 0.19], [0, y, -6.85], m.black);
  for (const x of [-5.82, -5.55, -5.28, 5.28, 5.55, 5.82]) {
    b.box([0.12, 4.55, 0.11], [x, 2.96, -7.18], m.wood);
  }

  b.box([4.6, 0.38, 0.56], [0, 0.3, -6.68], m.wood, 0.025);
  b.box([4.65, 0.055, 0.58], [0, 0.514, -6.68], m.black, 0.012);
  for (const x of [-1.75, -0.6, 0.6, 1.75]) {
    b.box([1.08, 0.285, 0.035], [x, 0.3, -6.382], m.woodLight, 0.006);
    b.box([0.19, 0.015, 0.035], [x, 0.4, -6.35], m.brass, 0.004);
  }
  b.box([0.63, 0.07, 0.3], [0, 0.58, -6.65], m.metal, 0.008);
  b.box([0.023, 0.006, 0.005], [0.21, 0.586, -6.493], m.ledSoft);
  makeSpeaker(b, -4.78, m);
  makeSpeaker(b, 4.78, m);
  makePlant(b, -5.68, -5.52, m);
  makePlant(b, 5.68, -5.52, m);
  makePoster(scene, b, -1, -2.0, 0, m);
  makePoster(scene, b, 1, 1.95, 1, m);

  // Open rear/right doorway and the cafe beyond it.
  // Open rear/right doorway: a corridor that leads to the premium cafeteria at its end.
  b.box([1.95, 0.3, 2.3], [7.23, 0.49, 5.76], m.woodLight);
  b.box([1.95, 3.1, 0.2], [7.23, 2.19, 4.65], m.hallway);
  b.box([1.95, 3.1, 0.2], [7.23, 2.19, 6.87], m.hallway);
  b.box([1.95, 0.15, 2.3], [7.23, 3.8, 5.76], m.hallway);
  for (const z of [4.79, 6.73]) b.box([0.28, 2.8, 0.14], [6.39, 2.04, z], m.wood);
  b.box([0.28, 0.15, 2.07], [6.39, 3.5, 5.76], m.wood);
  b.box([0.4, 0.025, 1.8], [6.4, 0.656, 5.76], m.brass);
  b.box([0.09, 2.58, 1.8], [7.328, 1.95, 6.54], m.black, 0.018, [0, -1.35, 0]);
  b.box([0.047, 0.21, 0.046], [7.92, 1.92, 6.304], m.metal, 0.015);
  b.box([0.21, 0.04, 0.045], [7.84, 2.012, 6.303], m.brass, 0.012);
  b.box([0.13, 0.45, 0.8], [6.29, 3.88, 5.76], m.black, 0.025);
  const exit = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.34), new THREE.MeshBasicMaterial({ map: labelTexture('EXIT', '#93bea1', '#14231a'), toneMapped: false }));
  exit.position.set(6.214, 3.88, 5.76);
  exit.rotation.y = -Math.PI / 2;
  scene.add(exit);
  const cafeSign = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 0.4), new THREE.MeshBasicMaterial({ map: labelTexture('AETHOFLIX CAFE', '#d8c3a0', '#191612'), toneMapped: false }));
  cafeSign.position.set(6.34, 3.42, 5.76);
  cafeSign.rotation.y = -Math.PI / 2;
  scene.add(cafeSign);
  b.box([0.055, 1.6, 0.04], [7.52, 2.23, 4.55], m.led);
  const hallLight = new THREE.PointLight('#ffc891', 13, 7, 2);
  hallLight.position.set(7.6, 3.25, 5.76);
  addRoomLight(hallLight);

  // ── Premium cafeteria shell at the very end of the exit path ──
  b.box([6.7, 0.3, 5.0], [11.5, 0.49, 5.8], m.woodLight);
  b.box([6.7, 0.15, 5.0], [11.5, 3.8, 5.8], m.ceiling);
  b.box([6.7, 3.1, 0.2], [11.5, 2.19, 3.3], m.hallway);
  b.box([6.7, 3.1, 0.2], [11.5, 2.19, 8.3], m.hallway);
  b.box([0.2, 3.1, 5.0], [14.8, 2.19, 5.8], m.hallway);
  b.box([0.2, 3.1, 1.45], [8.3, 2.19, 3.98], m.hallway);
  b.box([0.2, 3.1, 1.45], [8.3, 2.19, 7.6], m.hallway);
  // Charcoal wainscot with warm amber LED accents.
  b.box([6.7, 0.5, 0.06], [11.5, 0.89, 3.38], m.wood);
  b.box([6.7, 0.5, 0.06], [11.5, 0.89, 8.22], m.wood);
  b.box([0.06, 0.5, 5.0], [14.74, 0.89, 5.8], m.wood);
  b.box([6.7, 0.018, 0.02], [11.5, 1.155, 3.375], m.ledSoft);
  b.box([6.7, 0.018, 0.02], [11.5, 1.155, 8.185], m.ledSoft);
  // Illuminated CAFE sign above the cafeteria entrance.
  const cafeEntranceSign = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.62), new THREE.MeshBasicMaterial({ map: labelTexture('CAFE', '#f0c57e', '#171210'), toneMapped: false }));
  cafeEntranceSign.position.set(8.32, 3.44, 5.76);
  cafeEntranceSign.rotation.y = -Math.PI / 2;
  scene.add(cafeEntranceSign);
  b.box([2.16, 0.76, 0.08], [8.44, 3.44, 5.76], m.black, 0.012);
  b.box([2.1, 0.022, 0.02], [8.37, 3.02, 5.76], m.ledSoft);
  b.box([2.1, 0.022, 0.02], [8.37, 3.87, 5.76], m.ledSoft);
  // Service counter: dark wood with charcoal kick and amber under-lighting.
  b.box([4.3, 1.0, 1.0], [11.75, 1.14, 7.4], m.woodLight, 0.015);
  b.box([4.36, 0.05, 1.05], [11.75, 1.665, 7.4], m.woodLight, 0.008);
  b.box([4.3, 0.14, 0.9], [11.75, 0.71, 7.45], m.black);
  b.box([4.24, 0.02, 0.02], [11.75, 1.62, 6.865], m.ledSoft);
  for (const x of [10.5, 11.75, 13.0]) b.box([0.035, 0.68, 0.02], [x, 1.3, 6.885], m.brass);
  // Espresso machine and cups.
  b.box([0.52, 0.4, 0.36], [12.05, 1.89, 7.42], m.black, 0.02);
  b.box([0.5, 0.06, 0.34], [12.05, 2.1, 7.42], m.metal, 0.01);
  for (const [gx, gz] of [[11.9, 7.28], [12.2, 7.28]]) b.add(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 10), m.brass, [gx, 2.07, gz]);
  for (const cx of [11.55, 11.68, 11.81]) b.add(new THREE.CylinderGeometry(0.028, 0.024, 0.06, 10), m.china, [cx, 1.72, 7.58]);
  // Pastry display with treats.
  b.box([0.7, 0.08, 0.45], [13.35, 1.73, 7.4], m.woodLight);
  b.box([0.7, 0.3, 0.45], [13.35, 1.9, 7.4], m.glassDisplay);
  for (const [px, pz] of [[13.15, 7.3], [13.35, 7.45], [13.55, 7.32]]) b.add(new THREE.SphereGeometry(0.05, 10, 8), m.pastry, [px, 1.77, pz], [0, 0, 0], [1, 0.55, 0.8]);
  // Popcorn machine with warm interior.
  b.box([0.5, 0.62, 0.5], [10.5, 2.0, 7.4], m.black, 0.02);
  b.box([0.5, 0.16, 0.5], [10.5, 1.77, 7.4], m.leather, 0.015);
  b.box([0.36, 0.3, 0.36], [10.5, 2.19, 7.4], m.glassDisplay);
  b.box([0.3, 0.14, 0.3], [10.5, 2.15, 7.4], m.ledSoft);
  // Nachos warmer.
  b.box([0.44, 0.34, 0.4], [11.05, 1.86, 7.4], m.black, 0.015);
  b.box([0.4, 0.1, 0.36], [11.05, 1.95, 7.4], m.ledSoft);
  // Bottled drinks on the counter.
  for (let i = 0; i < 5; i++) b.add(new THREE.CylinderGeometry(0.024, 0.024, 0.16, 10), i % 2 ? m.bottleGreen : m.bottleAmber, [12.65 + i * 0.09, 1.77, 7.55]);
  // Plated sandwiches.
  for (const [sx, sz] of [[13.75, 7.35], [13.75, 7.5]]) {
    b.add(new THREE.CylinderGeometry(0.09, 0.09, 0.015, 14), m.china, [sx, 1.7, sz]);
    b.add(new THREE.SphereGeometry(0.055, 10, 8), m.bread, [sx, 1.745, sz], [0, 0, 0], [1, 0.5, 1]);
  }
  // Back shelves with bottled drinks.
  for (const sy of [2.02, 2.48]) {
    b.box([2.0, 0.045, 0.24], [14.62, sy, 6.9], m.woodLight, 0.008);
    for (let i = 0; i < 7; i++) b.add(new THREE.CylinderGeometry(0.025, 0.025, 0.16, 10), i % 3 ? m.bottleGreen : m.bottleAmber, [13.75 + i * 0.29, sy + 0.12, 6.9]);
  }
  // Menu board behind the counter.
  const menuCanvas = document.createElement('canvas');
  menuCanvas.width = 640;
  menuCanvas.height = 420;
  const menuCtx = menuCanvas.getContext('2d')!;
  menuCtx.fillStyle = '#141210';
  menuCtx.fillRect(0, 0, 640, 420);
  menuCtx.strokeStyle = '#7a5f38';
  menuCtx.lineWidth = 6;
  menuCtx.strokeRect(10, 10, 620, 400);
  menuCtx.textAlign = 'center';
  menuCtx.fillStyle = '#e8c27a';
  menuCtx.font = '600 46px Georgia';
  menuCtx.fillText('CAFE MENU', 320, 74);
  menuCtx.font = '400 34px Georgia';
  menuCtx.fillStyle = '#e8ddc4';
  ['Coffee        3.5', 'Cold Drinks   3.0', 'Popcorn       4.5', 'Nachos        5.0', 'Sandwiches    6.0', 'Desserts      4.0'].forEach((line, index) => menuCtx.fillText(line, 320, 138 + index * 42));
  menuCtx.fillStyle = '#a28a5e';
  menuCtx.font = '400 20px Georgia';
  menuCtx.fillText('OPEN DURING SCREENINGS', 320, 396);
  const menuTexture = new THREE.CanvasTexture(menuCanvas);
  menuTexture.colorSpace = THREE.SRGBColorSpace;
  const menuBoard = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.24), new THREE.MeshBasicMaterial({ map: menuTexture, toneMapped: false }));
  menuBoard.position.set(14.62, 2.72, 6.95);
  menuBoard.rotation.y = -Math.PI / 2;
  scene.add(menuBoard);
  b.box([2.02, 1.32, 0.07], [14.7, 2.72, 6.95], m.black, 0.01);
  // Fridge / display cabinet near the entrance.
  b.box([0.9, 1.9, 0.5], [8.55, 1.59, 7.95], m.fridgeSteel, 0.015);
  b.box([0.7, 1.15, 0.04], [8.55, 1.66, 7.685], m.glassDisplay);
  b.box([0.7, 0.02, 0.02], [8.55, 1.12, 7.675], m.ledSoft);
  for (const [fy, fz] of [[1.15, 7.85], [1.55, 7.85]]) for (let i = 0; i < 4; i++) b.add(new THREE.CylinderGeometry(0.022, 0.022, 0.14, 8), i % 2 ? m.bottleGreen : m.bottleAmber, [8.55 + (i - 1.5) * 0.14, fy, fz]);
  // Wall shelves with snack boxes.
  for (const sy of [1.92, 2.36]) {
    b.box([1.25, 0.045, 0.24], [11.25, sy, 8.1], m.woodLight, 0.006);
    for (let i = 0; i < 5; i++) b.box([0.09, 0.12, 0.14], [10.85 + i * 0.2, sy + 0.085, 8.1], i % 2 ? m.leather : m.wood, 0.008);
  }
  // Burgundy lounge sofa with a low coffee table.
  b.box([1.9, 0.3, 0.95], [10.3, 0.79, 3.9], m.black, 0.03);
  b.box([1.9, 0.5, 0.32], [10.3, 1.19, 3.55], m.leather, 0.07);
  for (const ax of [9.45, 11.15]) b.box([0.3, 0.55, 0.95], [ax, 1.065, 3.9], m.leather, 0.06);
  for (const cx of [9.85, 10.75]) b.box([0.78, 0.16, 0.72], [cx, 1.02, 4.1], m.cushion, 0.05);
  b.box([0.7, 0.045, 0.5], [10.3, 1.12, 4.98], m.woodLight, 0.006);
  for (const [lx, lz] of [[10.05, 4.78], [10.55, 4.78], [10.05, 5.18], [10.55, 5.18]]) b.add(new THREE.CylinderGeometry(0.014, 0.014, 0.44, 8), m.metal, [lx, 0.86, lz]);
  for (const [bx, bz] of [[10.15, 4.98], [10.45, 4.98]]) b.add(new THREE.CylinderGeometry(0.03, 0.026, 0.07, 10), m.china, [bx, 1.16, bz]);
  // Lounge rugs.
  b.add(new THREE.CylinderGeometry(1.55, 1.55, 0.012, 28), m.leather, [10.3, 0.646, 4.3]);
  b.box([3.0, 0.012, 1.6], [10.95, 0.646, 4.35], m.cushion);
  // Dining tables with comfortable chairs.
  for (const tx of [10.05, 11.85]) {
    b.add(new THREE.CylinderGeometry(0.05, 0.07, 0.74, 12), m.metal, [tx, 1.01, 4.35]);
    b.add(new THREE.CylinderGeometry(0.45, 0.45, 0.05, 20), m.woodLight, [tx, 1.39, 4.35]);
    b.add(new THREE.CylinderGeometry(0.42, 0.42, 0.012, 20), m.leather, [tx, 1.42, 4.35]);
    b.add(new THREE.CylinderGeometry(0.028, 0.024, 0.07, 10), m.china, [tx - 0.12, 1.46, 4.35]);
    b.add(new THREE.CylinderGeometry(0.028, 0.024, 0.07, 10), m.china, [tx + 0.12, 1.46, 4.35]);
  }
  const cafeChair = (x: number, z: number, yaw: number) => {
    b.add(new THREE.CylinderGeometry(0.022, 0.026, 0.44, 8), m.metal, [x, 0.92, z]);
    b.box([0.46, 0.07, 0.44], [x, 1.14, z], m.cushion, 0.03, [0, yaw, 0]);
    b.box([0.46, 0.5, 0.07], [x, 1.4, z - 0.19], m.leather, 0.03, [0, yaw, 0]);
    for (const s of [-1, 1]) b.box([0.07, 0.2, 0.42], [x + s * 0.24, 1.24, z], m.black, 0.02, [0, yaw, 0]);
  };
  cafeChair(9.35, 4.35, Math.PI / 2);
  cafeChair(10.75, 4.35, -Math.PI / 2);
  cafeChair(11.15, 4.35, Math.PI / 2);
  cafeChair(12.55, 4.35, -Math.PI / 2);
  // Counter stools.
  for (const sx of [9.75, 10.45]) {
    b.add(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 10), m.metal, [sx, 0.9, 6.72]);
    b.add(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 14), m.leather, [sx, 1.17, 6.72]);
  }
  // Vending machine, magazine rack, posters, plants.
  b.box([0.85, 1.95, 0.9], [13.6, 1.615, 3.66], m.wall, 0.015);
  b.box([0.6, 0.44, 0.025], [13.6, 1.96, 4.085], m.black, 0.004);
  b.box([0.5, 0.34, 0.01], [13.6, 1.96, 4.062], m.ledSoft, 0.003);
  b.box([0.42, 0.75, 0.32], [8.75, 1.015, 3.9], m.wood, 0.02);
  for (const [px, variant] of [[10.4, 0], [12.2, 1]] as const) {
    const posterPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.35), new THREE.MeshStandardMaterial({ map: posterTexture(variant ? 'ORBITAL' : 'THE QUIET|BETWEEN', variant ? 'SOME THINGS ARE WORTH FINDING.' : 'A FILM BY ELIAS NORTH', variant), roughness: 0.5 }));
    posterPlane.position.set(px, 2.3, 3.415);
    scene.add(posterPlane);
    b.box([0.98, 1.43, 0.05], [px, 2.3, 3.44], m.black, 0.006);
  }
  const cafePlant = (x: number, z: number) => {
    b.add(new THREE.CylinderGeometry(0.26, 0.2, 0.5, 16), m.planter, [x, 0.91, z]);
    for (let i = 0; i < 12; i++) {
      const angle = i * 2.7;
      const radius = 0.14 + (i % 3) * 0.05;
      b.add(new THREE.SphereGeometry(1, 7, 5), m.green, [x + Math.cos(angle) * radius, 1.4 + (i % 4) * 0.12, z + Math.sin(angle) * radius], [0, angle, 0.4], [0.08, 0.3, 0.03]);
    }
  };
  cafePlant(8.75, 5.0);
  cafePlant(8.75, 7.02);
  // Warm amber pendants.
  const pendant = (x: number, z: number, lit = true) => {
    b.add(new THREE.CylinderGeometry(0.012, 0.012, 0.9, 6), m.metal, [x, 3.42, z]);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), m.fixture);
    dome.position.set(x, 3.28, z);
    scene.add(dome);
    if (lit) {
      const light = new THREE.PointLight('#ffd9a0', 5.5, 3.4, 2);
      light.position.set(x, 3.3, z);
      addRoomLight(light);
    }
  };
  pendant(10.3, 6.55);
  pendant(12.1, 6.55);
  pendant(13.6, 6.55);
  pendant(10.95, 4.35, false);
  pendant(10.3, 4.15);
  b.finish(scene);

  const chairTemplate = makeChair(m);
  const shadowTexture = softShadowTexture();
  const shadowMaterial = new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false, opacity: 0.78, toneMapped: false });
  const seats = SEATS.map((seat) => {
    const chair = chairTemplate.clone(true);
    chair.name = seat.id;
    chair.userData.seatId = seat.id;
    chair.position.set(seat.x, seat.elevation, seat.z);
    chair.traverse((child) => { child.userData.seatId = seat.id; });
    const number = new THREE.Mesh(new THREE.PlaneGeometry(0.105, 0.062), new THREE.MeshBasicMaterial({ map: labelTexture(seat.id), toneMapped: false }));
    number.position.set(0, 1.05, 0.639);
    number.userData.seatId = seat.id;
    chair.add(number);
    scene.add(chair);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.95, 2.8), shadowMaterial);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(seat.x, seat.elevation + 0.008, seat.z - 0.12);
    scene.add(shadow);
    return chair;
  });

  const ambient = new THREE.HemisphereLight('#f1d3a9', '#161b23', 0.45);
  scene.add(ambient);
  for (const z of [-3.3, 3.45]) {
    const ceilingLight = new THREE.RectAreaLight('#ffcf99', 2.9, 9.4, 4.6);
    ceilingLight.position.set(0, 5.1, z);
    ceilingLight.lookAt(0, 0, z);
    addRoomLight(ceilingLight);
  }
  const rearLight = new THREE.RectAreaLight('#e7b985', 1.6, 9.5, 2.2);
  rearLight.position.set(0, 3.4, 7.08);
  rearLight.lookAt(0, 1.3, -2);
  addRoomLight(rearLight);

  const screenLight = new THREE.RectAreaLight('#abc0d1', 3.0, 7.8, 4.3875);
  screenLight.position.set(0, 2.93, -6.65);
  screenLight.lookAt(0, 2.0, 5);
  scene.add(screenLight);
  const screenShadow = new THREE.SpotLight('#c0d3dc', 35, 23, 1.02, 1, 1.3);
  screenShadow.position.set(0, 3.6, -6.57);
  screenShadow.target.position.set(0, 0.6, 4.8);
  screenShadow.castShadow = true;
  screenShadow.shadow.mapSize.set(1024, 1024);
  screenShadow.shadow.bias = -0.0005;
  screenShadow.shadow.normalBias = 0.035;
  screenShadow.shadow.camera.near = 0.35;
  screenShadow.shadow.camera.far = 23;
  scene.add(screenShadow, screenShadow.target);
  const faceLight = new THREE.PointLight('#b4c8de', 0, 3.5, 2);
  scene.add(faceLight);

  const filmCanvas = document.createElement('canvas');
  filmCanvas.width = 1920;
  filmCanvas.height = 1080;
  const ctx = filmCanvas.getContext('2d')!;
  ctx.fillStyle = '#1b2c35';
  ctx.fillRect(0, 0, 1920, 1080);
  const filmTexture = new THREE.CanvasTexture(filmCanvas);
  filmTexture.colorSpace = THREE.SRGBColorSpace;
  filmTexture.anisotropy = 8;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(7.8, 7.8 * 9 / 16), new THREE.MeshBasicMaterial({ map: filmTexture, toneMapped: false }));
  screen.position.set(0, 2.93, -6.828);
  scene.add(screen);
  const screenGlass = new THREE.Mesh(new THREE.PlaneGeometry(7.8, 7.8 * 9 / 16), new THREE.MeshPhysicalMaterial({
    color: '#b8c9d6', transparent: true, opacity: 0.008, roughness: 0.12,
    metalness: 0.1, clearcoat: 0.65, clearcoatRoughness: 0.12, depthWrite: false,
  }));
  screenGlass.position.set(0, 2.93, -6.812);
  scene.add(screenGlass);
  const ready = new Promise<void>((resolve) => {
    const image = new Image();
    const paintTitle = () => {
      const shade = ctx.createLinearGradient(0, 0, 1920, 0);
      shade.addColorStop(0, 'rgba(5,15,22,.45)');
      shade.addColorStop(0.75, 'rgba(5,15,22,0)');
      ctx.fillStyle = shade;
      ctx.fillRect(0, 0, 1920, 1080);
      ctx.fillStyle = '#f2eadb';
      ctx.font = '21px Arial';
      ctx.fillText('A E T H O F L I X   O R I G I N A L', 142, 388);
      ctx.font = '112px Georgia';
      ctx.fillText('AFTERLIGHT', 132, 512);
      ctx.fillStyle = '#d2d6d3';
      ctx.font = '25px Arial';
      ctx.fillText('There is a world beyond the everyday.', 142, 569);
      filmTexture.needsUpdate = true;
      resolve();
    };
    image.onload = () => {
      ctx.drawImage(image, 0, 0, 1920, 1080);
      paintTitle();
    };
    image.onerror = paintTitle;
    image.src = '/images/afterlight.jpg';
  });

  const makePatron = (x: number, z: number, yaw: number, tone: number) => {
    const patron = buildNpcAvatar(scene, shadowTexture, 'patron', tone);
    patron.root.position.set(x, 0.64, z);
    patron.root.rotation.y = yaw;
    const cup = makeDrinkCup();
    cup.scale.setScalar(0.85);
    cup.position.set(0, 0.02, -0.09);
    cup.rotation.x = 0.15;
    patron.rightForearm.add(cup);
    return patron;
  };
  const patrons = [
    makePatron(9.75, 6.72, Math.PI + 0.1, 0),
    makePatron(10.45, 6.72, Math.PI - 0.1, 1),
    makePatron(10.75, 4.35, Math.PI / 2, 2),
    makePatron(11.15, 4.35, -Math.PI / 2, 0),
  ];
  const barista = buildNpcAvatar(scene, shadowTexture, 'barista', 1);
  barista.root.position.set(12.7, 0.64, 8.02);
  barista.root.rotation.y = 0;
  const walker = buildNpcAvatar(scene, shadowTexture, 'patron', 1);
  walker.root.position.set(8.95, 0.64, 5.55);
  walker.root.rotation.y = Math.PI / 2;
  const cafeteria = { patrons, barista, walker };
  return { materials: m, seats, cafeteria, screen, screenLight, screenShadow, faceLight, roomLights, ambient, shadowTexture, filmTexture, environmentTarget, ready };
}
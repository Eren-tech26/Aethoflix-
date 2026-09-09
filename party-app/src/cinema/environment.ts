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
  cafeteria: { patrons: Avatar[]; barista: Avatar };
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

  // Open rear/right doorway and a real, lit corridor beyond it.
  b.box([3.5, 0.3, 2.2], [7.95, 0.49, 5.76], m.woodLight);
  b.box([3.5, 3.1, 0.2], [8.05, 2.19, 4.65], m.hallway);
  b.box([3.5, 3.1, 0.2], [8.05, 2.19, 6.87], m.hallway);
  b.box([0.2, 3.1, 2.3], [9.65, 2.19, 5.76], m.hallway);
  b.box([3.5, 0.15, 2.3], [8.05, 3.8, 5.76], m.hallway);
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
  b.box([0.055, 1.6, 0.04], [9.52, 2.23, 5.2], m.led);
  const hallLight = new THREE.PointLight('#ffc891', 13, 6, 2);
  hallLight.position.set(8.25, 3.25, 5.75);
  addRoomLight(hallLight);
  // Cafe counter and seating along the far side of the hall.
  b.box([0.55, 1.06, 2.3], [9.28, 0.53, 5.76], m.woodLight, 0.015);
  b.box([0.62, 0.05, 2.42], [9.25, 1.075, 5.76], m.metal, 0.008);
  b.box([0.5, 0.34, 0.44], [9.24, 1.21, 4.98], m.black, 0.02);
  b.box([0.34, 0.1, 0.3], [9.24, 1.42, 4.98], m.brass, 0.01);
  for (const x of [8.72]) for (const z of [5.14, 6.36]) {
    b.add(new THREE.CylinderGeometry(0.17, 0.19, 0.62, 14), m.metal, [x, 0.31, z]);
    b.add(new THREE.CylinderGeometry(0.19, 0.19, 0.05, 14), m.woodLight, [x, 0.635, z]);
  }
  const menuSign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.55), new THREE.MeshBasicMaterial({ map: labelTexture('CAFE & SNACKS', '#e6d9bc', '#221c14'), toneMapped: false }));
  menuSign.position.set(9.15, 1.72, 4.99);
  menuSign.rotation.y = -Math.PI / 2;
  scene.add(menuSign);
  const cafeSign = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 0.4), new THREE.MeshBasicMaterial({ map: labelTexture('AETHOFLIX CAFE', '#d8c3a0', '#191612'), toneMapped: false }));
  cafeSign.position.set(6.34, 3.42, 5.76);
  cafeSign.rotation.y = -Math.PI / 2;
  scene.add(cafeSign);
  const pendantLight = new THREE.PointLight('#ffd9a0', 7, 3.4, 2);
  pendantLight.position.set(9.15, 1.6, 5.9);
  addRoomLight(pendantLight);
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

  const patrons = [0, 1].map((index) => {
    const patron = buildNpcAvatar(scene, shadowTexture, 'patron', index);
    patron.root.position.set(8.72, 0.62, index === 0 ? 5.14 : 6.36);
    patron.root.rotation.y = Math.PI * 0.96;
    const cup = makeDrinkCup();
    cup.scale.setScalar(0.85);
    cup.position.set(0, 0.02, -0.09);
    cup.rotation.x = 0.15;
    patron.rightForearm.add(cup);
    return patron;
  });
  const barista = buildNpcAvatar(scene, shadowTexture, 'barista', 2);
  barista.root.position.set(9.5, 0, 5.76);
  barista.root.rotation.y = Math.PI;
  const cafeteria = { patrons, barista };
  return { materials: m, seats, cafeteria, screen, screenLight, screenShadow, faceLight, roomLights, ambient, shadowTexture, filmTexture, environmentTarget, ready };
}
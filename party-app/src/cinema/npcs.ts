import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Avatar } from './avatar';

type Outfit = 'patron' | 'barista' | 'waitress';

const OUTFIT_COLORS: Record<Outfit, string> = { patron: '#7f8f78', barista: '#4b3a2e', waitress: '#e9e7df' };

export function buildNpcAvatar(scene: THREE.Scene, shadowTexture: THREE.Texture, outfit: Outfit, tone = 0): Avatar {
  const root = new THREE.Group();
  const body = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color: OUTFIT_COLORS[outfit], roughness: 0.9 });
  const bottom = new THREE.MeshStandardMaterial({ color: outfit === 'waitress' ? '#262a26' : '#333c38', roughness: 0.95 });
  const apron = new THREE.MeshStandardMaterial({ color: outfit === 'barista' ? '#37301f' : '#efe6d2', roughness: 0.92 });
  const skin = new THREE.MeshStandardMaterial({ color: ['#c09971', '#b18563', '#d0a37a'][tone], roughness: 0.85 });
  const hair = new THREE.MeshStandardMaterial({ color: outfit === 'waitress' ? '#31241c' : '#241c16', roughness: 0.95 });
  const shoe = new THREE.MeshStandardMaterial({ color: '#1f201e', roughness: 0.8 });

  function part(parent: THREE.Object3D, size: [number, number, number], position: [number, number, number], material: THREE.Material, radius = 0.025) {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(...size, 1, radius), material);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  part(body, [0.34, 0.17, 0.24], [0, 0.86, 0], bottom);
  part(body, [0.41, 0.5, 0.26], [0, 1.18, 0], shirt, 0.05);
  part(body, [0.3, 0.42, 0.02], [0, 1.08, -0.135], apron, 0.012);
  part(body, [0.14, 0.085, 0.15], [0, 1.462, 0], skin);
  part(body, [0.28, 0.32, 0.28], [0, 1.62, -0.008], skin, 0.055);
  part(body, [0.3, 0.13, 0.3], [0, 1.762, 0.008], hair, 0.042);
  if (outfit === 'waitress') part(body, [0.09, 0.09, 0.09], [0, 1.855, -0.1], hair, 0.03);
  part(body, [0.3, 0.17, 0.1], [0, 1.662, 0.118], hair, 0.028);
  for (const x of [-0.06, 0.06]) part(body, [0.03, 0.014, 0.011], [x, 1.648, -0.15], hair, 0.004);
  part(body, [0.042, 0.048, 0.024], [0, 1.6, -0.152], skin, 0.012);

  function leg(side: number) {
    const limb = new THREE.Group();
    limb.position.set(side * 0.105, 0.85, 0);
    part(limb, [0.17, 0.4, 0.2], [0, -0.2, 0], bottom, 0.03);
    const shin = new THREE.Group();
    shin.position.y = -0.4;
    part(shin, [0.15, 0.31, 0.17], [0, -0.155, 0], outfit === 'waitress' ? skin : bottom, 0.025);
    part(shin, [0.18, 0.1, 0.28], [0, -0.34, -0.05], shoe, 0.028);
    limb.add(shin);
    body.add(limb);
    return [limb, shin];
  }

  function arm(side: number) {
    const limb = new THREE.Group();
    limb.position.set(side * 0.245, 1.36, 0);
    part(limb, [0.12, 0.3, 0.17], [0, -0.14, 0], shirt, 0.032);
    const forearm = new THREE.Group();
    forearm.position.y = -0.28;
    part(forearm, [0.11, 0.24, 0.14], [0, -0.11, 0], shirt, 0.028);
    part(forearm, [0.115, 0.1, 0.12], [0, -0.25, 0], skin, 0.03);
    limb.add(forearm);
    body.add(limb);
    return [limb, forearm];
  }
  const [leftLeg, leftShin] = leg(-1);
  const [rightLeg, rightShin] = leg(1);
  const [leftArm, leftForearm] = arm(-1);
  const [rightArm, rightForearm] = arm(1);
  root.add(body);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 1.05), new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  root.add(shadow);
  scene.add(root);
  const jacket = shirt;
  const jacketDark = apron;
  return { root, body, leftLeg, rightLeg, leftShin, rightShin, leftArm, rightArm, leftForearm, rightForearm, jacket, jacketDark };
}

export function makePopcorn(): THREE.Group {
  const group = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.19, 0.11), new THREE.MeshStandardMaterial({ color: '#a23034', roughness: 0.7 }));
  box.position.y = 0.095;
  group.add(box);
  for (let i = 0; i < 4; i++) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.152, 0.028, 0.112), new THREE.MeshStandardMaterial({ color: '#efe9dc', roughness: 0.75 }));
    stripe.position.y = 0.06 + i * 0.04;
    group.add(stripe);
  }
  for (let i = 0; i < 6; i++) {
    const kernel = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 6), new THREE.MeshStandardMaterial({ color: '#ecd9a2', roughness: 0.85 }));
    kernel.position.set((i % 3 - 1) * 0.035, 0.205 + Math.floor(i / 3) * 0.02, (i % 2) * 0.03 - 0.015);
    group.add(kernel);
  }
  return group;
}

export function makeDrinkCup(): THREE.Group {
  const group = new THREE.Group();
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.028, 0.13, 14), new THREE.MeshStandardMaterial({ color: '#6e2f2f', roughness: 0.5 }));
  cup.position.y = 0.065;
  group.add(cup);
  const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.18, 6), new THREE.MeshStandardMaterial({ color: '#d9cdb4', roughness: 0.7 }));
  straw.position.set(0.014, 0.16, 0);
  straw.rotation.z = 0.22;
  group.add(straw);
  return group;
}

export function makeMealTray(): THREE.Group {
  const group = new THREE.Group();
  const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.02, 20), new THREE.MeshStandardMaterial({ color: '#3b2f22', roughness: 0.55 }));
  group.add(tray);
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.015, 18), new THREE.MeshStandardMaterial({ color: '#e6e1d4', roughness: 0.6 }));
  plate.position.y = 0.02;
  group.add(plate);
  const food = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 8), new THREE.MeshStandardMaterial({ color: '#c98d4b', roughness: 0.9 }));
  food.position.y = 0.045;
  food.scale.y = 0.55;
  group.add(food);
  const drink = makeDrinkCup();
  drink.scale.setScalar(0.8);
  drink.position.set(0.105, 0.05, 0);
  group.add(drink);
  return group;
}

export function makeServiceTray(): THREE.Group {
  const group = new THREE.Group();
  const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.016, 20), new THREE.MeshStandardMaterial({ color: '#4a3d2c', roughness: 0.5, metalness: 0.2 }));
  group.add(tray);
  const popcorn = makePopcorn();
  popcorn.scale.setScalar(0.72);
  popcorn.position.set(-0.06, 0.05, 0);
  group.add(popcorn);
  const drink = makeDrinkCup();
  drink.scale.setScalar(0.85);
  drink.position.set(0.09, 0.07, 0);
  group.add(drink);
  return group;
}

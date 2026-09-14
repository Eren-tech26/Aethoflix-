import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { PlayerProfile } from './types';

export type Avatar = {
  root: THREE.Group;
  body: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftShin: THREE.Group;
  rightShin: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftForearm: THREE.Group;
  rightForearm: THREE.Group;
  jacket: THREE.MeshStandardMaterial;
  jacketDark: THREE.MeshStandardMaterial;
};

export function buildAvatar(scene: THREE.Scene, shadowTexture: THREE.Texture): Avatar {
  const root = new THREE.Group();
  root.name = 'local-player';
  const body = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: '#c8bea9', roughness: 0.94 });
  const jacketDark = new THREE.MeshStandardMaterial({ color: '#a49984', roughness: 0.89 });
  const trousers = new THREE.MeshStandardMaterial({ color: '#303b3b', roughness: 0.95 });
  const skin = new THREE.MeshStandardMaterial({ color: '#b38563', roughness: 0.85 });
  const hair = new THREE.MeshStandardMaterial({ color: '#2a201c', roughness: 0.95 });
  const shoe = new THREE.MeshStandardMaterial({ color: '#242421', roughness: 0.8 });
  const sole = new THREE.MeshStandardMaterial({ color: '#b0a58e', roughness: 0.95 });
  const black = new THREE.MeshStandardMaterial({ color: '#211d19', roughness: 0.9 });

  function part(parent: THREE.Object3D, dimensions: [number, number, number], position: [number, number, number], material: THREE.Material, radius = 0.025) {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(...dimensions, 1, radius), material);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  part(body, [0.37, 0.17, 0.25], [0, 0.86, 0], trousers);
  part(body, [0.45, 0.51, 0.27], [0, 1.18, 0], jacket, 0.05);
  part(body, [0.019, 0.44, 0.012], [0, 1.18, -0.14], jacketDark, 0.004);
  part(body, [0.145, 0.085, 0.155], [0, 1.467, 0], skin);
  part(body, [0.18, 0.045, 0.19], [0, 1.445, 0], jacketDark, 0.012);
  part(body, [0.307, 0.33, 0.3], [0, 1.639, -0.008], skin, 0.06);
  part(body, [0.328, 0.13, 0.324], [0, 1.782, 0.008], hair, 0.044);
  part(body, [0.325, 0.185, 0.097], [0, 1.675, 0.125], hair, 0.03);
  part(body, [0.052, 0.086, 0.074], [0.158, 1.637, -0.001], skin, 0.02);
  part(body, [0.052, 0.086, 0.074], [-0.158, 1.637, -0.001], skin, 0.02);
  for (const x of [-0.068, 0.068]) part(body, [0.032, 0.015, 0.012], [x, 1.665, -0.159], black, 0.004);
  part(body, [0.046, 0.05, 0.026], [0, 1.617, -0.165], skin, 0.013);

  function leg(side: number) {
    const limb = new THREE.Group();
    limb.position.set(side * 0.113, 0.85, 0);
    part(limb, [0.186, 0.405, 0.215], [0, -0.2, 0], trousers, 0.032);
    const shin = new THREE.Group();
    shin.position.y = -0.405;
    part(shin, [0.164, 0.325, 0.18], [0, -0.161, 0], trousers, 0.025);
    part(shin, [0.19, 0.11, 0.3], [0, -0.348, -0.052], shoe, 0.029);
    part(shin, [0.192, 0.028, 0.302], [0, -0.397, -0.052], sole, 0.01);
    limb.add(shin);
    body.add(limb);
    return [limb, shin];
  }

  function arm(side: number) {
    const limb = new THREE.Group();
    limb.position.set(side * 0.266, 1.371, 0);
    part(limb, [0.13, 0.31, 0.18], [0, -0.143, 0], jacket, 0.038);
    const forearm = new THREE.Group();
    forearm.position.y = -0.288;
    part(forearm, [0.12, 0.254, 0.15], [0, -0.114, 0], jacket, 0.03);
    part(forearm, [0.132, 0.11, 0.13], [0, -0.273, 0], skin, 0.032);
    limb.add(forearm);
    body.add(limb);
    return [limb, forearm];
  }
  const [leftLeg, leftShin] = leg(-1);
  const [rightLeg, rightShin] = leg(1);
  const [leftArm, leftForearm] = arm(-1);
  const [rightArm, rightForearm] = arm(1);
  root.add(body);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.015;
  root.add(shadow);
  scene.add(root);
  return { root, body, leftLeg, rightLeg, leftShin, rightShin, leftArm, rightArm, leftForearm, rightForearm, jacket, jacketDark };
}

export function styleAvatar(avatar: Avatar, profile: PlayerProfile) {
  avatar.jacket.color.set(profile.color);
  avatar.jacketDark.color.set(profile.color).multiplyScalar(0.72);
  avatar.root.userData.playerName = profile.name;
}

export function poseAvatar(a: Avatar, sit: number, speed: number, phase: number, dt: number) {
  const walk = Math.min(1, speed / 2.25) * (1 - sit);
  const swing = Math.sin(phase) * 0.43 * walk;
  a.body.position.y = -0.1 * sit + (1 - sit) * Math.sin(phase * 2) * 0.018 * walk;
  a.body.rotation.x = 0.025 * sit;
  a.leftLeg.rotation.x = THREE.MathUtils.damp(a.leftLeg.rotation.x, swing * (1 - sit) + 1.48 * sit, 17, dt);
  a.rightLeg.rotation.x = THREE.MathUtils.damp(a.rightLeg.rotation.x, -swing * (1 - sit) + 1.48 * sit, 17, dt);
  a.leftShin.rotation.x = -0.64 * sit - Math.max(0, -swing) * 0.45 * (1 - sit);
  a.rightShin.rotation.x = -0.64 * sit - Math.max(0, swing) * 0.45 * (1 - sit);
  a.leftArm.rotation.x = -swing * 0.65 * (1 - sit) + 0.1 * sit;
  a.rightArm.rotation.x = swing * 0.65 * (1 - sit) + 0.1 * sit;
  a.leftArm.position.x = -0.266 - sit * 0.15;
  a.rightArm.position.x = 0.266 + sit * 0.15;
  a.leftArm.rotation.z = -0.1 * sit;
  a.rightArm.rotation.z = 0.1 * sit;
  a.leftForearm.rotation.x = a.rightForearm.rotation.x = 1.15 * sit;
}

export function disposeAvatar(avatar: Avatar) {
  const materials = new Set<THREE.Material>();
  avatar.root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => materials.add(material));
    }
  });
  materials.forEach((material) => material.dispose());
  avatar.root.removeFromParent();
}
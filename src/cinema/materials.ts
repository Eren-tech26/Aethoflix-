import * as THREE from 'three';

function random(seed: number) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function surfaceTexture(kind: 'leather' | 'carpet' | 'acoustic' | 'wood'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(256, 256);
  const rng = random(128);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const i = (y * 256 + x) * 4;
      let value = 175 + rng() * 65;
      if (kind === 'carpet') value = 80 + rng() * 125 + (x % 3 === 0 ? 15 : 0);
      if (kind === 'acoustic') value = x % 5 === 0 && y % 5 === 0 ? 40 : 180 + rng() * 50;
      if (kind === 'wood') value = 105 + Math.sin(x * 0.2 + Math.sin(y * 0.013) * 1.3) * 34 + rng() * 28;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = value;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(kind === 'carpet' ? 36 : kind === 'leather' ? 3 : 5, kind === 'carpet' ? 42 : 4);
  texture.anisotropy = 4;
  return texture;
}

export function makeMaterials() {
  const leather = surfaceTexture('leather');
  const carpet = surfaceTexture('carpet');
  const acoustic = surfaceTexture('acoustic');
  const wood = surfaceTexture('wood');
  const mats = {
    leather: new THREE.MeshPhysicalMaterial({ color: '#641f2b', roughness: 0.4, metalness: 0.02, bumpMap: leather, bumpScale: 0.007, roughnessMap: leather, clearcoat: 0.22, clearcoatRoughness: 0.48 }),
    cushion: new THREE.MeshPhysicalMaterial({ color: '#7c2938', roughness: 0.48, bumpMap: leather, bumpScale: 0.008, clearcoat: 0.17, clearcoatRoughness: 0.5 }),
    piping: new THREE.MeshStandardMaterial({ color: '#9a4954', roughness: 0.62 }),
    carpet: new THREE.MeshStandardMaterial({ color: '#282727', roughness: 1, map: carpet, bumpMap: carpet, bumpScale: 0.025 }),
    platform: new THREE.MeshStandardMaterial({ color: '#252322', roughness: 0.98, map: carpet, bumpMap: carpet, bumpScale: 0.016 }),
    acoustic: new THREE.MeshStandardMaterial({ color: '#36332f', roughness: 0.96, bumpMap: acoustic, bumpScale: 0.012 }),
    acousticDark: new THREE.MeshStandardMaterial({ color: '#222322', roughness: 0.94, bumpMap: acoustic, bumpScale: 0.01 }),
    wood: new THREE.MeshStandardMaterial({ color: '#423026', roughness: 0.56, map: wood, bumpMap: wood, bumpScale: 0.009 }),
    woodLight: new THREE.MeshStandardMaterial({ color: '#635044', roughness: 0.64, map: wood }),
    wall: new THREE.MeshStandardMaterial({ color: '#262523', roughness: 0.89 }),
    black: new THREE.MeshStandardMaterial({ color: '#0d1010', roughness: 0.46, metalness: 0.2 }),
    metal: new THREE.MeshStandardMaterial({ color: '#373331', metalness: 0.85, roughness: 0.3 }),
    brass: new THREE.MeshStandardMaterial({ color: '#ad8b52', metalness: 0.78, roughness: 0.35 }),
    screenFrame: new THREE.MeshStandardMaterial({ color: '#070808', roughness: 0.82 }),
    ceiling: new THREE.MeshStandardMaterial({ color: '#242321', roughness: 0.92 }),
    ceilingInset: new THREE.MeshStandardMaterial({ color: '#101313', roughness: 0.95 }),
    led: new THREE.MeshStandardMaterial({ color: '#efbe78', emissive: '#ffbd62', emissiveIntensity: 2.4, roughness: 0.65, toneMapped: false }),
    ledSoft: new THREE.MeshStandardMaterial({ color: '#966032', emissive: '#f7a349', emissiveIntensity: 0.85, roughness: 0.9 }),
    fixture: new THREE.MeshStandardMaterial({ color: '#fff3d4', emissive: '#ffe4b4', emissiveIntensity: 3.4, toneMapped: false }),
    hallway: new THREE.MeshStandardMaterial({ color: '#8a7160', roughness: 0.9, bumpMap: acoustic, bumpScale: 0.009 }),
    green: new THREE.MeshStandardMaterial({ color: '#293d26', roughness: 0.82, side: THREE.DoubleSide }),
    planter: new THREE.MeshStandardMaterial({ color: '#37342d', roughness: 0.63, metalness: 0.28 }),
    earth: new THREE.MeshStandardMaterial({ color: '#17110b', roughness: 1 }),
    bottleAmber: new THREE.MeshStandardMaterial({ color: '#a8762e', roughness: 0.3, metalness: 0.06 }),
    bottleGreen: new THREE.MeshStandardMaterial({ color: '#3f6f4d', roughness: 0.35 }),
    pastry: new THREE.MeshStandardMaterial({ color: '#d9a662', roughness: 0.85 }),
    bread: new THREE.MeshStandardMaterial({ color: '#a9763f', roughness: 0.9 }),
    china: new THREE.MeshStandardMaterial({ color: '#e8e4d8', roughness: 0.4 }),
    glassDisplay: new THREE.MeshPhysicalMaterial({ color: '#cfe0e4', transparent: true, opacity: 0.16, roughness: 0.12, metalness: 0.1, depthWrite: false }),
    fridgeSteel: new THREE.MeshStandardMaterial({ color: '#3a4146', metalness: 0.75, roughness: 0.3 }),
  };
  return mats;
}

export type CinemaMaterials = ReturnType<typeof makeMaterials>;

export function labelTexture(text: string, color = '#d8c2a0', background = '#1a1815'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = color;
  ctx.font = '500 49px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 67);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function softShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(64, 64, 20, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(0,0,0,.62)');
  gradient.addColorStop(0.55, 'rgba(0,0,0,.4)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

export function posterTexture(title: string, subtitle: string, variant: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 600;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, 400, 600);
  gradient.addColorStop(0, variant ? '#1e3436' : '#645045');
  gradient.addColorStop(1, '#0b0f12');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 400, 600);
  if (variant) {
    for (let i = 5; i >= 0; i--) {
      ctx.beginPath();
      ctx.arc(200, 255, 37 + i * 22, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(204,178,132,${0.1 + i * 0.035})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(200, 255, 42, 0, Math.PI * 2);
    ctx.fillStyle = '#bbaa8f';
    ctx.fill();
  } else {
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(0, 380 - i * 31);
      ctx.lineTo(95, 230 - i * 13);
      ctx.lineTo(183, 340 - i * 19);
      ctx.lineTo(292, 210 - i * 15);
      ctx.lineTo(400, 320 - i * 16);
      ctx.lineTo(400, 470);
      ctx.lineTo(0, 470);
      ctx.fillStyle = `rgba(14,23,27,${0.2 + i * 0.1})`;
      ctx.fill();
    }
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = '#d8cdbb';
  ctx.font = '13px Arial';
  ctx.fillText('A E T H O F L I X   O R I G I N A L', 200, 44);
  ctx.font = '38px Georgia';
  title.split('|').forEach((line, i) => ctx.fillText(line, 200, 465 + i * 44));
  ctx.font = '11px Arial';
  ctx.fillStyle = '#a99f91';
  ctx.fillText(subtitle, 200, 560);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
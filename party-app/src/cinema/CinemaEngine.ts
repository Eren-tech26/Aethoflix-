import * as THREE from 'three';
import { buildEnvironment, type CinemaEnvironment } from './environment';
import { buildAvatar, disposeAvatar, poseAvatar, styleAvatar, type Avatar } from './avatar';
import { buildNpcAvatar, makeDrinkCup, makeMealTray, makePopcorn, makeServiceTray } from './npcs';
import { COLLIDERS, SEATS, SPAWN, PREVIEW_START, findPath, floorHeight, movePlayer, seatApproach, validateLayout, type LayoutValidation, type Point2, type Seat } from './world';
import { AMBIENT_MEDIA, playbackPosition, type CinemaSnapshot, type MediaSelection, type Mode, type PartyBridge, type PlaybackChange, type PlaybackState, type PlayerPose, type PlayerProfile, type Quality, type RemotePlayer } from './types';
import { ProviderSurface } from './ProviderSurface';
import { validateEmbed } from '../catalog/servers';

type Callbacks = {
  onUpdate: (snapshot: CinemaSnapshot) => void;
  onReady: () => void;
  onMessage: (message: string) => void;
  onValidation: (validation: LayoutValidation) => void;
};

const damp = (from: number, to: number, speed: number, dt: number) => THREE.MathUtils.lerp(from, to, 1 - Math.exp(-speed * dt));
const smoothstep = (t: number) => t * t * (3 - 2 * t);

function turnToward(current: number, target: number, amount: number): number {
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + difference * amount;
}

export class CinemaEngine {
  private host: HTMLDivElement;
  private callbacks: Callbacks;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(49, 1, 0.075, 55);
  private renderer: THREE.WebGLRenderer;
  private environment: CinemaEnvironment;
  private avatar: Avatar;
  private resizeObserver: ResizeObserver;
  private frameId = 0;
  private disposed = false;
  private started = false;
  private lastTime = 0;
  private time = 0;
  private filmTime = 0;
  private snapshotTime = 0;
  private fpsTime = 0;
  private fpsFrames = 0;
  private fps = 0;
  private state: Mode = 'explore';
  private position = { ...PREVIEW_START };
  private velocity = new THREE.Vector2();
  private joystick = new THREE.Vector2();
  private keys = new Set<string>();
  private inputsEnabled = true;
  private overview = true;
  private yaw = 0.35;
  private pitch = 0.31;
  private cameraDistance = 3.5;
  private cameraTarget = new THREE.Vector3(-0.55, 1.28, -2.35);
  private desiredCamera = new THREE.Vector3();
  private desiredTarget = new THREE.Vector3();
  private playerCameraOrigin = new THREE.Vector3();
  private rayDirection = new THREE.Vector3();
  private rayHit = new THREE.Vector3();
  private cameraRay = new THREE.Ray();
  private cameraBoxes: { id: string; box: THREE.Box3 }[];
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private pointer: { id: number; x: number; y: number; startX: number; startY: number; moved: boolean } | null = null;
  private activeSeat: Seat | null = null;
  private nearbySeat: Seat | null = null;
  private route: Point2[] = [];
  private transitionProgress = 0;
  private transitionFrom = new THREE.Vector3();
  private transitionTo = new THREE.Vector3();
  private sitAmount = 0;
  private walkPhase = 0;
  private lightLevel = 1;
  private playing = true;
  private muted = true;
  private quality: Quality = 'auto';
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private pixelRatio = 1;
  private filmTitle = 'Afterlight';
  private video: HTMLVideoElement | null = null;
  private videoUrl: string | null = null;
  private videoMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null;
  private videoSample = document.createElement('canvas');
  private videoSampleTime = 0;
  private sampledColor = new THREE.Color('#a8bbcb');
  private coolColor = new THREE.Color('#9bbbd4');
  private warmColor = new THREE.Color('#cdbba0');
  private filmColor = new THREE.Color();
  private interactionRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private audioContext: AudioContext | null = null;
  private audioGain: GainNode | null = null;
  private audioSources: OscillatorNode[] = [];
  private validationWorker: Worker | null = null;
  private visibilityWasPlaying = false;
  private media: MediaSelection = AMBIENT_MEDIA;
  private volume = 0.65;
  private playbackRate = 1;
  private loop = true;
  private buffering = false;
  private loading = false;
  private autoplayBlocked = false;
  private playbackError = '';
  private mediaGeneration = 0;
  private cancelPendingMedia: (() => void) | null = null;
  private previewCanvas: HTMLCanvasElement | null = null;
  private previewTime = 0;
  private partyBridge: PartyBridge | null = null;
  private latestPlayback: PlaybackState | null = null;
  private remotePlayers = new Map<string, { avatar: Avatar; target: PlayerPose; receivedAt: number; sit: number }>();
  private occupiedSeats = new Map<string, string>();
  private reservingSeat: string | null = null;
  private reservationGeneration = 0;
  private provider: ProviderSurface;
  private waitress: { rig: Avatar; tray: THREE.Group; station: Point2; route: Point2[]; phase: 'station' | 'coming' | 'delivering' | 'returning'; timer: number; seat: Seat | null; orders: number; walkPhase: number };
  private patrolWaitress: { rig: Avatar; tray: THREE.Group; legs: Point2[]; index: number; timer: number; walkPhase: number; moving: boolean };
  private foodGroup: THREE.Group | null = null;
  private foodAnchor = new THREE.Object3D();
  private eatingProgress: number | null = null;
  private foodName = '';
  private servicePhase: 'idle' | 'summoned' | 'coming' | 'delivering' | 'returning' = 'idle';
  private chewPhase = 0;
  private highRefresh = false;
  private fastFrames = 0;
  private sampledFrames = 0;
  private patrolPaths: { leg: Point2[]; next: Point2 }[] = [];

  constructor(host: HTMLDivElement, callbacks: Callbacks) {
    this.host = host;
    this.callbacks = callbacks;
    this.scene.background = new THREE.Color('#0c0e0f');
    this.scene.fog = new THREE.FogExp2('#0e1011', 0.003);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.32;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.domElement.setAttribute('aria-label', 'Walkable AethoFlix private cinema. Use WASD to walk, drag to look, and E to sit or stand.');
    this.renderer.domElement.setAttribute('role', 'img');
    host.appendChild(this.renderer.domElement);
    this.environment = buildEnvironment(this.scene, this.renderer);
    this.provider = new ProviderSurface(host, this.environment.screen, () => this.publish());
    this.renderer.domElement.className = 'cinema-webgl';
    this.avatar = buildAvatar(this.scene, this.environment.shadowTexture);
    this.avatar.root.position.set(this.position.x, floorHeight(this.position.x, this.position.z), this.position.z);
    this.avatar.root.rotation.y = 0.14;
    this.camera.position.set(5.78, 4.58, 7.05);
    this.camera.lookAt(this.cameraTarget);
    this.cameraBoxes = COLLIDERS.filter((collider) => !SEATS.some((seat) => seat.id === collider.id)).map((collider) => ({
      id: collider.id,
      box: new THREE.Box3(
        new THREE.Vector3(collider.minX - 0.06, collider.bottom, collider.minZ - 0.06),
        new THREE.Vector3(collider.maxX + 0.06, collider.top + 0.06, collider.maxZ + 0.06),
      ),
    }));
    for (const seat of SEATS) {
      this.cameraBoxes.push({ id: seat.id, box: new THREE.Box3(
        new THREE.Vector3(seat.x - 0.58, seat.elevation + 0.46, seat.z + 0.2),
        new THREE.Vector3(seat.x + 0.58, seat.elevation + 1.69, seat.z + 0.78),
      ) });
      this.cameraBoxes.push({ id: seat.id, box: new THREE.Box3(
        new THREE.Vector3(seat.x - 0.68, seat.elevation, seat.z - 1.12),
        new THREE.Vector3(seat.x + 0.68, seat.elevation + 0.91, seat.z + 0.55),
      ) });
    }
    this.interactionRing = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.235, 36), new THREE.MeshBasicMaterial({ color: '#e0bf83', transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide }));
    this.interactionRing.rotation.x = -Math.PI / 2;
    this.interactionRing.visible = false;
    this.scene.add(this.interactionRing);
    const station: Point2 = { x: 5.28, z: 6.28 };
    const waitressRig = buildNpcAvatar(this.scene, this.environment.shadowTexture, 'waitress', 1);
    waitressRig.root.position.set(station.x, floorHeight(station.x, station.z), station.z);
    const serviceTray = makeServiceTray();
    serviceTray.position.set(0, 0.03, 0.15);
    waitressRig.rightForearm.add(serviceTray);
    this.waitress = { rig: waitressRig, tray: serviceTray, station, route: [], phase: 'station', timer: 0, seat: null, orders: 0, walkPhase: 0 };
    const patrolRig = buildNpcAvatar(this.scene, this.environment.shadowTexture, 'waitress', 2);
    patrolRig.root.position.set(station.x + 0.9, 0.64, station.z);
    const patrolTray = makeServiceTray();
    patrolTray.position.set(0, 0.03, 0.15);
    patrolRig.rightForearm.add(patrolTray);
    this.patrolWaitress = { rig: patrolRig, tray: patrolTray, legs: [], index: 0, timer: 2.5, walkPhase: 0, moving: false };
    const patrolPoints: Point2[] = [{ x: 6.15, z: 6.28 }, { x: -5.42, z: 0.28 }, { x: 5.42, z: 0.28 }, { x: 6.15, z: 6.28 }];
    this.patrolPaths = patrolPoints.map((next, index) => ({ next, leg: index === 0 ? [] : [] }));
    for (let index = 0; index < patrolPoints.length; index++) {
      const from = index === 0 ? { x: patrolRig.root.position.x, z: patrolRig.root.position.z } : patrolPoints[index - 1];
      this.patrolPaths[index] = { next: patrolPoints[index], leg: findPath(from, patrolPoints[index]) ?? [] };
    }
    this.scene.add(this.foodAnchor);
    this.videoSample.width = this.videoSample.height = 8;
    this.setQuality('auto');
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(host);
    this.resize();
    this.addEvents();

    this.environment.ready.then(async () => {
      if (this.disposed) return;
      await this.renderer.compileAsync(this.scene, this.camera);
      if (this.disposed) return;
      this.startRendering();
      const validateOnMainThread = () => {
        this.validationWorker?.terminate();
        this.validationWorker = null;
        window.setTimeout(() => { if (!this.disposed) this.callbacks.onValidation(validateLayout()); }, 50);
      };
      try {
        this.validationWorker = new Worker(new URL('./navigation.worker.ts', import.meta.url), { type: 'module' });
        this.validationWorker.onmessage = (event: MessageEvent<LayoutValidation>) => {
          if (!this.disposed) this.callbacks.onValidation(event.data);
          this.validationWorker?.terminate();
          this.validationWorker = null;
        };
        this.validationWorker.onerror = validateOnMainThread;
        this.validationWorker.postMessage('validate');
      } catch { validateOnMainThread(); }
    }).catch((error: unknown) => {
      if (!this.disposed) {
        console.error(error);
        this.callbacks.onMessage('The graphics driver could not prepare this room. Try reloading or a WebGL 2-compatible browser.');
        this.startRendering();
      }
    });
  }

  private startRendering() {
    if (this.started || this.disposed) return;
    this.started = true;
    this.callbacks.onReady();
    if (!document.hidden) this.frameId = requestAnimationFrame(this.animate);
  }

  private resize = () => {
    if (this.disposed) return;
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.provider.resize(width, height);
  };

  private addEvents() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.clearInput);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.host.addEventListener('pointerdown', this.onPointerDown);
    this.host.addEventListener('pointermove', this.onPointerMove);
    this.host.addEventListener('pointerup', this.onPointerUp);
    this.host.addEventListener('pointercancel', this.onPointerCancel);
    this.host.addEventListener('wheel', this.onWheel, { passive: false });
    this.host.addEventListener('contextmenu', this.onContextMenu);
  }

  private onContextMenu = (event: Event) => event.preventDefault();
  private clearInput = () => { this.keys.clear(); this.joystick.set(0, 0); this.pointer = null; };
  private onKeyDown = (event: KeyboardEvent) => {
    if (!this.inputsEnabled || event.ctrlKey || event.metaKey || event.altKey || /INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement)?.tagName)) return;
    const key = event.key.toLowerCase();
    if (key === ' ' && /^(BUTTON|A)$/.test((event.target as HTMLElement)?.tagName)) return;
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright', ' ', 'e', 'r', 'shift'].includes(key)) event.preventDefault();
    this.keys.add(key);
    if (event.repeat) return;
    if (key === 'e') this.interact();
    if (key === 'r') this.resetView();
    if (key === ' ') this.togglePlayback();
  };
  private onKeyUp = (event: KeyboardEvent) => this.keys.delete(event.key.toLowerCase());

  private onPointerDown = (event: PointerEvent) => {
    if (!this.inputsEnabled || this.pointer) return;
    this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
    this.host.setPointerCapture(event.pointerId);
  };
  private onPointerMove = (event: PointerEvent) => {
    if (!this.pointer || this.pointer.id !== event.pointerId || !this.inputsEnabled) return;
    const dx = event.clientX - this.pointer.x;
    const dy = event.clientY - this.pointer.y;
    if (Math.hypot(event.clientX - this.pointer.startX, event.clientY - this.pointer.startY) > 5) this.pointer.moved = true;
    if (this.pointer.moved && this.state !== 'seated' && this.state !== 'sitting') {
      this.overview = false;
      this.yaw -= dx * 0.004;
      this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.003, -0.08, 0.95);
    }
    this.pointer.x = event.clientX;
    this.pointer.y = event.clientY;
  };
  private onPointerUp = (event: PointerEvent) => {
    if (!this.pointer || this.pointer.id !== event.pointerId) return;
    if (!this.pointer.moved && this.inputsEnabled && this.state === 'explore') {
      const rect = this.host.getBoundingClientRect();
      this.mouse.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const hit = this.raycaster.intersectObjects(this.environment.seats, true)[0];
      if (hit?.object.userData.seatId) this.takeSeat(hit.object.userData.seatId as string);
    }
    if (this.host.hasPointerCapture(event.pointerId)) this.host.releasePointerCapture(event.pointerId);
    this.pointer = null;
  };
  private onPointerCancel = () => { this.pointer = null; };
  private onWheel = (event: WheelEvent) => {
    if (!this.inputsEnabled || this.state === 'seated') return;
    event.preventDefault();
    this.cameraDistance = THREE.MathUtils.clamp(this.cameraDistance + event.deltaY * 0.004, 2.2, 5.5);
    this.overview = false;
  };
  private onVisibility = () => {
    this.clearInput();
    if (document.hidden) {
      cancelAnimationFrame(this.frameId);
      this.visibilityWasPlaying = this.playing;
      if (!this.partyBridge) this.video?.pause();
      void this.audioContext?.suspend();
    } else if (!this.disposed && this.started) {
      this.lastTime = 0;
      this.frameId = requestAnimationFrame(this.animate);
      if (this.video && this.visibilityWasPlaying && !this.partyBridge) this.playVideo();
      if (!this.muted) void this.audioContext?.resume();
      if (this.partyBridge && this.latestPlayback) this.applyPlayback(this.latestPlayback);
    }
  };

  setInputEnabled(enabled: boolean) {
    this.inputsEnabled = enabled;
    if (!enabled) this.clearInput();
  }
  setJoystick(x: number, y: number) { this.joystick.set(x, y); }
  setReducedMotion(value: boolean) { this.reducedMotion = value; }

  setProfile(profile: PlayerProfile) {
    styleAvatar(this.avatar, profile);
    this.renderer.shadowMap.needsUpdate = true;
  }

  followPlayer() {
    if (this.state === 'seated') this.stand();
    this.overview = false;
    this.yaw = this.avatar.root.rotation.y + 0.18;
    this.pitch = 0.26;
    this.publish();
  }

  setPartyBridge(bridge: PartyBridge | null) {
    this.partyBridge = bridge;
    if (!bridge) this.latestPlayback = null;
  }

  setRemotePlayers(players: RemotePlayer[]) {
    this.occupiedSeats = new Map(players.filter((player) => player.seatId).map((player) => [player.seatId!, player.name]));
    const ids = new Set(players.map((player) => player.id));
    for (const [id, remote] of this.remotePlayers) {
      if (!ids.has(id)) { disposeAvatar(remote.avatar); this.remotePlayers.delete(id); }
    }
    players.forEach((player, index) => {
      let remote = this.remotePlayers.get(player.id);
      if (!remote) {
        const avatar = buildAvatar(this.scene, this.environment.shadowTexture);
        avatar.root.name = `player-${player.id}`;
        const seat = SEATS.find((item) => item.id === player.seatId);
        const target: PlayerPose = { x: seat?.x ?? 4.7 - index * 0.7, y: seat?.elevation ?? 0.64, z: seat ? seat.z - 0.09 : 6.15, yaw: 0, sit: seat ? 1 : 0, phase: 0, speed: 0 };
        avatar.root.position.set(target.x, target.y, target.z);
        remote = { avatar, target, receivedAt: 0, sit: target.sit };
        this.remotePlayers.set(player.id, remote);
      }
      styleAvatar(remote.avatar, player);
    });
    this.renderer.shadowMap.needsUpdate = true;
  }

  setRemotePose(id: string, pose: PlayerPose) {
    const remote = this.remotePlayers.get(id);
    if (remote) {
      if (remote.receivedAt === 0) {
        remote.avatar.root.position.set(pose.x, pose.y, pose.z);
        remote.avatar.root.rotation.y = pose.yaw;
        remote.sit = pose.sit;
        this.renderer.shadowMap.needsUpdate = true;
      }
      remote.target = pose;
      remote.receivedAt = performance.now();
    }
  }

  setPreviewCanvas(canvas: HTMLCanvasElement | null) {
    this.previewCanvas = canvas;
    if (canvas) { canvas.width = 1920; canvas.height = 1080; this.drawPreview(); }
  }

  setProviderDock(dock: HTMLDivElement | null) { this.provider.setDock(dock); }
  reloadProvider() { this.provider.reload(); }

  getMediaSelection() { return this.media; }

  getPlaybackState(): PlaybackState {
    return { sourceId: this.media.id, time: this.video?.currentTime ?? this.filmTime, duration: this.video && Number.isFinite(this.video.duration) ? this.video.duration : 0, playing: this.playing, rate: this.playbackRate, loop: this.loop, updatedAt: Date.now() };
  }

  setQuality(quality: Quality) {
    this.quality = quality;
    const dpr = window.devicePixelRatio || 1;
    const touchDevice = window.matchMedia('(pointer: coarse)').matches;
    this.pixelRatio = quality === 'high' ? Math.min(dpr, 2) : quality === 'performance' ? 1 : Math.min(dpr, 1.5);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.shadowMap.enabled = quality !== 'performance';
    this.renderer.shadowMap.needsUpdate = true;
    if (this.environment) {
      const shadowSize = quality === 'high' ? 2048 : touchDevice ? 512 : 1024;
      this.environment.screenShadow.shadow.mapSize.set(shadowSize, shadowSize);
      this.environment.screenShadow.shadow.map?.dispose();
      this.environment.screenShadow.shadow.map = null;
      this.environment.roomLights.forEach(({ light }, index) => { light.visible = quality !== 'performance' || !(light instanceof THREE.PointLight) || index % 2 === 0; });
    }
  }

  async takeSeat(id?: string) {
    if (this.state === 'seated' || this.state === 'sitting' || this.state === 'standing' || this.reservingSeat) return;
    const available = SEATS.filter((item) => !this.occupiedSeats.has(item.id));
    const seat = id ? SEATS.find((item) => item.id === id) : this.nearbySeat && !this.occupiedSeats.has(this.nearbySeat.id) ? this.nearbySeat : [...available].sort((a, b) => Math.hypot(a.x - this.position.x, a.z - this.position.z) - Math.hypot(b.x - this.position.x, b.z - this.position.z))[0];
    if (!seat) { this.callbacks.onMessage('Every recliner is occupied. You can still enjoy the room.'); return; }
    if (this.occupiedSeats.has(seat.id)) { this.callbacks.onMessage(`${this.occupiedSeats.get(seat.id)} has seat ${seat.id}. Choose another recliner.`); return; }
    if (this.partyBridge) {
      const generation = ++this.reservationGeneration;
      const bridge = this.partyBridge;
      this.reservingSeat = seat.id;
      this.publish();
      const allowed = await bridge.reserveSeat(seat.id).catch(() => false);
      this.reservingSeat = null;
      if (this.disposed || generation !== this.reservationGeneration) { if (allowed) bridge.releaseSeat(seat.id); return; }
      if (!allowed) { this.callbacks.onMessage(`Seat ${seat.id} is not available. Please choose another seat.`); this.publish(); return; }
    }
    const route = findPath(this.position, seatApproach(seat));
    if (!route) {
      this.partyBridge?.releaseSeat();
      this.callbacks.onMessage('There is no clear approach from here. Move into an aisle and try again.');
      return;
    }
    this.activeSeat = seat;
    this.route = route;
    this.state = 'walking';
    this.overview = false;
    this.clearInput();
    this.publish();
  }

  interact() {
    if (this.state === 'seated') this.stand();
    else if (this.state === 'walking') this.cancelWalk();
    else if (this.state === 'explore') {
      if (this.nearbySeat) this.takeSeat(this.nearbySeat.id);
      else this.callbacks.onMessage('Approach a recliner and press E, or click any chair to take a seat.');
    }
  }

  cancelWalk() {
    if (this.state !== 'walking') return;
    this.route = [];
    this.activeSeat = null;
    this.state = 'explore';
    this.partyBridge?.releaseSeat();
    this.publish();
  }

  ringBell() {
    if (this.state !== 'seated' || this.servicePhase !== 'idle' || this.eatingProgress !== null) {
      this.callbacks.onMessage('The bell only rings between orders. Enjoy your snack first!');
      return;
    }
    if (!this.activeSeat) return;
    const approach = seatApproach(this.activeSeat);
    const route = findPath({ x: this.waitress.rig.root.position.x, z: this.waitress.rig.root.position.z }, approach);
    if (!route) { this.callbacks.onMessage('The server cannot reach your seat right now. Try again in a moment.'); return; }
    this.waitress.seat = this.activeSeat;
    this.waitress.route = route;
    this.waitress.phase = 'coming';
    this.waitress.orders++;
    this.servicePhase = 'coming';
    this.ping();
    this.publish();
  }

  private ping() {
    if (this.muted || this.media.kind === 'embed') return;
    this.prepareAudio();
    const context = this.audioContext;
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(1860, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(1240, context.currentTime + 0.22);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.05, context.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.5);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.55);
  }

  private removeFood() {
    if (this.foodGroup) {
      this.scene.remove(this.foodGroup);
      this.foodGroup.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const material = Array.isArray(object.material) ? object.material : [object.material];
          material.forEach((item) => item.dispose());
        }
      });
      this.foodGroup = null;
    }
  }

  private deliverFood() {
    this.removeFood();
    const isSnack = this.waitress.orders % 2 === 1;
    const food = new THREE.Group();
    if (isSnack) {
      const popcorn = makePopcorn();
      popcorn.scale.setScalar(1.15);
      popcorn.position.set(-0.02, 0.02, 0);
      const drink = makeDrinkCup();
      drink.scale.setScalar(1.05);
      drink.position.set(0.09, 0.01, -0.02);
      food.add(popcorn, drink);
      this.foodName = 'Popcorn & drink';
    } else {
      const meal = makeMealTray();
      meal.scale.setScalar(1.05);
      food.add(meal);
      this.foodName = 'Hot meal';
    }
    this.foodGroup = food;
    this.scene.add(food);
    this.eatingProgress = 0;
    this.chewPhase = 0;
    this.servicePhase = 'returning';
    this.waitress.phase = 'returning';
    if (this.waitress.seat) {
      const approach = seatApproach(this.waitress.seat);
      this.waitress.route = findPath(approach, this.waitress.station) ?? [];
    } else this.waitress.route = [];
    this.callbacks.onMessage(`${this.foodName} is served. Sit back and enjoy!`);
    this.publish();
  }

  private stepRig(rig: Avatar, route: Point2[], speed: number, dt: number, walkPhaseRef: { walkPhase: number }): boolean {
    if (!route.length) return true;
    const target = route[0];
    const x = rig.root.position.x;
    const z = rig.root.position.z;
    const dx = target.x - x;
    const dz = target.z - z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.09) {
      route.shift();
      return !route.length;
    }
    const step = Math.min(distance, speed * dt);
    rig.root.position.x += dx / distance * step;
    rig.root.position.z += dz / distance * step;
    rig.root.position.y = floorHeight(rig.root.position.x, rig.root.position.z);
    rig.root.rotation.y = turnToward(rig.root.rotation.y, Math.atan2(-dx, -dz), 1 - Math.exp(-9 * dt));
    walkPhaseRef.walkPhase += step * 4.6;
    return false;
  }

  private holdTray(rig: Avatar) {
    rig.rightArm.rotation.x = -1.4;
    rig.rightForearm.rotation.x = -1.15;
    rig.leftArm.rotation.x = -0.25;
  }

  private updateNpcs(dt: number) {
    const w = this.waitress;
    if (w.phase === 'station') {
      poseAvatar(w.rig, 0, 0, w.walkPhase, dt);
      w.rig.root.rotation.y = turnToward(w.rig.root.rotation.y, 1.9, 1 - Math.exp(-2 * dt));
      this.holdTray(w.rig);
    } else if (w.route.length) {
      const arrived = this.stepRig(w.rig, w.route, 1.7, dt, w);
      poseAvatar(w.rig, 0, arrived ? 0 : 1, w.walkPhase, dt);
      this.holdTray(w.rig);
      if (arrived) {
        if (w.phase === 'coming') {
          w.phase = 'delivering';
          w.timer = 1.5;
          this.servicePhase = 'delivering';
        } else if (w.phase === 'returning') {
          w.phase = 'station';
          this.servicePhase = 'idle';
        }
        this.renderer.shadowMap.needsUpdate = true;
      } else {
        this.renderer.shadowMap.needsUpdate = true;
      }
    } else if (w.phase === 'coming') {
      w.phase = 'delivering';
      w.timer = 1.5;
      this.servicePhase = 'delivering';
    } else if (w.phase === 'returning') {
      w.phase = 'station';
      this.servicePhase = 'idle';
      this.renderer.shadowMap.needsUpdate = true;
    }
    if (w.phase === 'delivering') {
      w.timer -= dt;
      poseAvatar(w.rig, 0, 0, w.walkPhase, dt);
      this.holdTray(w.rig);
      w.rig.root.rotation.y = turnToward(w.rig.root.rotation.y, Math.PI, 1 - Math.exp(-6 * dt));
      w.tray.position.set(0, 0.03, 0.26);
      if (w.timer <= 0) {
        if (this.state === 'seated' && w.seat) this.deliverFood();
        else {
          w.phase = 'returning';
          this.servicePhase = 'returning';
          w.route = findPath({ x: w.rig.root.position.x, z: w.rig.root.position.z }, w.station) ?? [];
        }
      }
    } else {
      w.tray.position.set(0, 0.03, 0.15);
    }

    const p = this.patrolWaitress;
    if (p.legs.length === 0 && p.moving && this.patrolPaths.length) {
      const current = this.patrolPaths[p.index];
      if (current?.leg?.length) p.legs = [...current.leg];
      else { p.moving = false; p.timer = 4; }
    }
    if (p.moving && p.legs.length) {
      const done = this.stepRig(p.rig, p.legs, 0.95, dt, p);
      if (done) {
        p.index = (p.index + 1) % this.patrolPaths.length;
        p.legs = [];
        p.timer = 4.5;
        p.moving = false;
      }
      poseAvatar(p.rig, 0, 0.6, p.walkPhase, dt);
      this.holdTray(p.rig);
      this.renderer.shadowMap.needsUpdate = true;
    } else {
      p.timer -= dt;
      poseAvatar(p.rig, 0, 0, p.walkPhase, dt);
      this.holdTray(p.rig);
      if (p.timer <= 0) { p.moving = true; this.renderer.shadowMap.needsUpdate = true; }
    }
  }

  private updateCafeteria(dt: number) {
    const { patrons, barista } = this.environment.cafeteria;
    patrons.forEach((patron, index) => {
      poseAvatar(patron, 1, 0, 0, dt);
      const lift = 0.5 + 0.5 * Math.sin(this.time * 0.8 + index * 2.4);
      patron.rightForearm.rotation.x = 1.15 - lift * 0.75;
      patron.rightArm.rotation.x = 0.2 + lift * 0.25;
    });
    poseAvatar(barista, 0, 0, 0, dt);
    barista.leftArm.rotation.x = 0.55 + Math.sin(this.time * 1.3) * 0.2;
    barista.rightForearm.rotation.x = -1.25;
  }

  private updateServiceAndFood(dt: number) {
    if (this.eatingProgress !== null && this.state === 'seated') {
      this.eatingProgress += dt / 16;
      this.chewPhase += dt * 9;
      if (this.eatingProgress >= 1) {
        this.eatingProgress = null;
        this.callbacks.onMessage('All finished. Ring the bell on your armrest and your server will bring the next round.');
        this.publish();
      }
    } else if (this.eatingProgress !== null) {
      this.eatingProgress = null;
    }
    if (this.foodGroup) {
      if (this.eatingProgress !== null) {
        const root = this.avatar.root;
        this.foodGroup.position.set(root.position.x, root.position.y + 1.56 + Math.sin(this.chewPhase * 1.4) * 0.012, root.position.z - 0.14);
        this.foodGroup.rotation.set(0.1 + Math.sin(this.chewPhase) * 0.04, 0, 0);
      } else if (this.waitress.seat) {
        this.foodGroup.position.set(this.waitress.seat.x - 0.52, this.waitress.seat.elevation + 0.9, this.waitress.seat.z - 0.13);
        this.foodGroup.rotation.set(0, 0, 0);
      }
    }
  }

  private beginSitting() {
    if (!this.activeSeat) return;
    this.state = 'sitting';
    this.transitionProgress = 0;
    this.transitionFrom.set(this.position.x, this.avatar.root.position.y, this.position.z);
    this.transitionTo.set(this.activeSeat.x, this.activeSeat.elevation, this.activeSeat.z - 0.09);
    this.velocity.set(0, 0);
    this.publish();
  }

  stand() {
    if (this.state !== 'seated' || !this.activeSeat) return;
    if (this.eatingProgress !== null) {
      this.removeFood();
      this.eatingProgress = null;
    }
    this.state = 'standing';
    this.transitionProgress = 0;
    this.transitionFrom.copy(this.avatar.root.position);
    const approach = seatApproach(this.activeSeat);
    this.transitionTo.set(approach.x, this.activeSeat.elevation, approach.z);
    this.yaw = 0.2;
    this.pitch = 0.3;
    this.publish();
  }

  resetView() {
    this.reservationGeneration++;
    this.partyBridge?.releaseSeat();
    this.removeFood();
    this.eatingProgress = null;
    this.foodName = '';
    this.servicePhase = 'idle';
    const station = this.waitress.station;
    this.waitress.rig.root.position.set(station.x, floorHeight(station.x, station.z), station.z);
    this.waitress.phase = 'station';
    this.waitress.route = [];
    this.waitress.seat = null;
    this.state = 'explore';
    this.activeSeat = null;
    this.position = { ...SPAWN };
    this.route = [];
    this.velocity.set(0, 0);
    this.clearInput();
    this.sitAmount = 0;
    this.overview = true;
    this.avatar.root.position.set(SPAWN.x, floorHeight(SPAWN.x, SPAWN.z), SPAWN.z);
    this.renderer.shadowMap.needsUpdate = true;
    this.yaw = 0.35;
    this.pitch = 0.31;
    this.callbacks.onMessage('Back at the entrance. Make yourself at home.');
    this.publish();
  }

  togglePlayback() {
    if (this.media.kind === 'embed') { this.callbacks.onMessage('Use the controls inside the selected provider player. External playback is not controlled by the cinema.'); return; }
    if (this.autoplayBlocked) { this.enablePlayback(); return; }
    this.changePlayback({ playing: !this.playing });
  }

  changePlayback(change: PlaybackChange) {
    if (this.media.kind === 'embed') return;
    if (this.partyBridge) {
      if (!this.partyBridge.canControl) { this.callbacks.onMessage('The host controls the shared player. Your sound and seat are always yours to choose.'); return; }
      this.partyBridge.playback(change);
      return;
    }
    this.applyPlayback({ ...this.getPlaybackState(), ...change, updatedAt: Date.now() }, change.time !== undefined);
  }

  applyPlayback(playback: PlaybackState, forceSeek = false) {
    this.latestPlayback = playback;
    if (this.media.kind === 'embed') return;
    if (playback.sourceId !== this.media.id) return;
    this.playbackRate = THREE.MathUtils.clamp(playback.rate, 0.25, 2);
    this.loop = playback.loop;
    this.playing = playback.playing;
    const position = playbackPosition(playback);
    if (this.video) {
      this.video.playbackRate = this.playbackRate;
      this.video.loop = this.loop;
      if (Number.isFinite(this.video.duration) && (forceSeek || Math.abs(this.video.currentTime - position) > 0.55)) this.video.currentTime = Math.min(position, this.video.duration);
      if (!this.playing) this.video.pause();
      else if (this.video.paused && !this.autoplayBlocked && !this.playbackError) this.playVideo();
    } else this.filmTime = position;
    this.updateAudio();
    this.publish();
  }

  private playVideo() {
    const video = this.video;
    if (!video) return;
    void video.play().then(() => {
      if (this.video === video && !this.disposed) { this.autoplayBlocked = false; this.publish(); }
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (this.video === video && !this.disposed && this.playing) {
        this.autoplayBlocked = true;
        this.callbacks.onMessage('Your browser needs a tap to start the video. Press Enable playback in the player.');
        this.publish();
      }
    });
  }

  enablePlayback() {
    this.autoplayBlocked = false;
    if (this.partyBridge && this.latestPlayback) this.applyPlayback(this.latestPlayback);
    else { this.playing = true; this.playVideo(); this.updateAudio(); }
    this.publish();
  }

  setVolume(volume: number) {
    this.volume = THREE.MathUtils.clamp(volume, 0, 1);
    this.muted = this.volume === 0;
    if (this.video) { this.video.volume = this.volume; this.video.muted = this.muted; }
    this.prepareAudio();
    this.updateAudio();
    this.publish();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (!this.muted && this.volume === 0) this.volume = 0.65;
    if (this.video) { this.video.muted = this.muted; this.video.volume = this.volume; }
    this.prepareAudio();
    this.updateAudio();
    this.publish();
  }

  private prepareAudio() {
    if (!this.audioContext && !this.muted && !this.video) {
      this.audioContext = new AudioContext();
      this.audioGain = this.audioContext.createGain();
      this.audioGain.gain.value = 0;
      this.audioGain.connect(this.audioContext.destination);
      for (const frequency of [55, 82.406, 110.04]) {
        const oscillator = this.audioContext.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        oscillator.connect(this.audioGain);
        oscillator.start();
        this.audioSources.push(oscillator);
      }
    }
    if (!this.muted) void this.audioContext?.resume();
  }

  private updateAudio() {
    if (this.audioGain && this.audioContext) this.audioGain.gain.setTargetAtTime(this.muted || !this.playing || this.video || this.media.kind === 'embed' ? 0 : 0.009 * this.volume, this.audioContext.currentTime, 0.45);
  }

  async loadLocalVideo(file: File): Promise<void> {
    await this.loadMedia({ id: `file-${Date.now()}-${file.size}`, kind: 'file', title: file.name.replace(/\.[^.]+$/, ''), file });
  }

  cancelMediaLoading() {
    if (!this.loading) return;
    this.mediaGeneration++;
    this.cancelPendingMedia?.();
    this.cancelPendingMedia = null;
    this.loading = false;
    this.publish();
  }

  async loadMedia(media: MediaSelection, autoplay = true): Promise<void> {
    if (media.kind === 'embed') {
      if (!validateEmbed(media)) throw new Error('The provider URL does not match this title and server.');
      this.cancelMediaLoading();
      this.clearVideo();
      this.media = media;
      this.filmTitle = media.title;
      this.playing = false;
      this.loading = this.buffering = this.autoplayBlocked = false;
      this.playbackError = '';
      this.environment.screen.material.map = null;
      this.environment.screen.material.color.set('#000000');
      this.provider.load(media);
      this.updateAudio();
      this.publish();
      return;
    }
    if (media.kind === 'ambient') { this.restoreAmbient(); if (!autoplay) this.applyPlayback({ ...this.getPlaybackState(), playing: false }); return; }
    if (media.kind === 'file' && (!(media.file instanceof Blob) || (!media.file.type.startsWith('video/') && !/\.(mp4|webm|ogv|mov|m4v)$/i.test(media.file.name)))) throw new Error('Choose an MP4, WebM, or another browser-supported video.');
    if (media.kind === 'url') {
      let parsed: URL;
      try { parsed = new URL(media.url); } catch { throw new Error('Enter a complete HTTPS link to an MP4 or WebM video.'); }
      if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && parsed.origin === window.location.origin)) throw new Error('Use an HTTPS video URL. Embed links and streaming-service pages are not supported.');
      if (parsed.username || parsed.password) throw new Error('Use a video URL without embedded account credentials.');
    }
    this.cancelPendingMedia?.();
    const generation = ++this.mediaGeneration;
    this.loading = true;
    this.publish();
    const objectUrl = media.kind === 'file' ? URL.createObjectURL(media.file) : null;
    const url = objectUrl ?? (media.kind === 'url' ? media.url : '');
    const video = document.createElement('video');
    video.playsInline = true;
    video.loop = this.loop;
    video.preload = 'auto';
    video.muted = this.muted;
    video.volume = this.volume;
    if (media.kind === 'url') video.crossOrigin = 'anonymous';
    video.src = url;
    try {
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => { clearTimeout(timeout); video.onloadeddata = null; video.onerror = null; };
        const timeout = window.setTimeout(() => { cleanup(); reject(new Error('The video took too long to load. Try a smaller file or a different direct video URL.')); }, 22000);
        this.cancelPendingMedia = () => { cleanup(); reject(new Error('Video loading was cancelled.')); };
        video.onloadeddata = () => { cleanup(); resolve(); };
        video.onerror = () => { cleanup(); reject(new Error(media.kind === 'url' ? 'This source could not be played. Use a direct MP4/WebM URL whose server allows cross-origin (CORS) access. Your current film has not changed.' : 'Your browser cannot decode this video. Try an H.264 MP4 or WebM file.')); };
      });
      if (this.disposed || generation !== this.mediaGeneration) throw new Error('Video loading was cancelled.');
      this.cancelPendingMedia = null;
      this.provider.clear();
      this.clearVideo();
      this.video = video;
      this.videoUrl = objectUrl;
      this.media = media;
      this.buffering = false;
      this.autoplayBlocked = false;
      this.playbackError = '';
      const texture = new THREE.VideoTexture(video);
      texture.colorSpace = THREE.SRGBColorSpace;
      this.videoMesh = new THREE.Mesh(new THREE.PlaneGeometry(7.8, 7.8 * 9 / 16), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
      const aspect = video.videoWidth / video.videoHeight;
      this.videoMesh.scale.set(Math.min(1, aspect / (16 / 9)), Math.min(1, (16 / 9) / aspect), 1);
      this.videoMesh.position.copy(this.environment.screen.position);
      this.videoMesh.position.z += 0.008;
      this.scene.add(this.videoMesh);
      this.environment.screen.material.map = null;
      this.environment.screen.material.color.set('#000000');
      this.environment.screen.material.needsUpdate = true;
      this.filmTitle = media.title;
      this.playing = autoplay;
      video.onwaiting = () => { this.buffering = true; this.publish(); };
      video.onplaying = () => { this.buffering = false; this.autoplayBlocked = false; this.publish(); };
      video.oncanplay = () => { this.buffering = false; this.publish(); };
      video.onended = () => {
        this.playing = false;
        if (!this.partyBridge || this.partyBridge.canControl) this.changePlayback({ playing: false, time: video.duration });
        this.publish();
      };
      video.onerror = () => {
        this.buffering = false;
        this.playing = false;
        this.playbackError = 'Video playback was interrupted. Choose the source again in the screen player to retry.';
        if (this.partyBridge?.canControl) this.partyBridge.playback({ playing: false, time: Number.isFinite(video.currentTime) ? video.currentTime : 0 });
        this.callbacks.onMessage(this.playbackError);
        this.publish();
      };
      if (autoplay) this.playVideo();
      this.updateAudio();
      this.publish();
    } catch (error) {
      video.onloadeddata = video.onerror = null;
      video.removeAttribute('src');
      video.load();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      throw error;
    } finally {
      if (generation === this.mediaGeneration) { this.cancelPendingMedia = null; this.loading = false; this.publish(); }
    }
  }

  restoreAmbient() {
    this.mediaGeneration++;
    this.cancelPendingMedia?.();
    this.cancelPendingMedia = null;
    this.provider.clear();
    this.clearVideo();
    this.media = AMBIENT_MEDIA;
    this.filmTime = 0;
    this.loading = this.buffering = this.autoplayBlocked = false;
    this.playbackError = '';
    this.environment.screen.material.map = this.environment.filmTexture;
    this.environment.screen.material.color.set('#ffffff');
    this.environment.screen.material.needsUpdate = true;
    this.filmTitle = 'Afterlight';
    this.playing = true;
    this.updateAudio();
    this.publish();
  }

  seek(time: number) {
    if (this.video && Number.isFinite(this.video.duration)) this.changePlayback({ time: THREE.MathUtils.clamp(time, 0, this.video.duration) });
  }

  private clearVideo() {
    if (this.video) {
      this.video.onwaiting = this.video.onplaying = this.video.oncanplay = this.video.onended = this.video.onerror = null;
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
      this.video = null;
    }
    if (this.videoMesh) {
      this.scene.remove(this.videoMesh);
      this.videoMesh.material.map?.dispose();
      this.videoMesh.material.dispose();
      this.videoMesh.geometry.dispose();
      this.videoMesh = null;
    }
    if (this.videoUrl) URL.revokeObjectURL(this.videoUrl);
    this.videoUrl = null;
  }

  private updateMovement(dt: number) {
    if (this.state === 'sitting' || this.state === 'standing') {
      this.transitionProgress = Math.min(1, this.transitionProgress + dt / (this.reducedMotion ? 0.55 : 1.22));
      const amount = smoothstep(this.transitionProgress);
      this.avatar.root.position.lerpVectors(this.transitionFrom, this.transitionTo, amount);
      this.avatar.root.position.y += Math.sin(amount * Math.PI) * 0.16;
      this.avatar.root.rotation.y = turnToward(this.avatar.root.rotation.y, 0, 1 - Math.exp(-7 * dt));
      // Fold the knees before crossing the footrest, and extend only after clearing it.
      this.sitAmount = this.state === 'sitting'
        ? smoothstep(Math.min(1, amount * 1.35))
        : 1 - smoothstep(Math.max(0, (amount - 0.28) / 0.72));
      this.position.x = this.avatar.root.position.x;
      this.position.z = this.avatar.root.position.z;
      if (this.transitionProgress >= 1) {
        if (this.state === 'sitting') this.state = 'seated';
        else { this.state = 'explore'; this.activeSeat = null; this.partyBridge?.releaseSeat(); }
        this.publish();
      }
      return;
    }
    if (this.state === 'seated') return;

    let inputX = this.inputsEnabled ? this.joystick.x + Number(this.keys.has('d') || this.keys.has('arrowright')) - Number(this.keys.has('a') || this.keys.has('arrowleft')) : 0;
    let inputZ = this.inputsEnabled ? this.joystick.y + Number(this.keys.has('s') || this.keys.has('arrowdown')) - Number(this.keys.has('w') || this.keys.has('arrowup')) : 0;
    const hasInput = Math.hypot(inputX, inputZ) > 0.09;
    if (hasInput) {
      this.overview = false;
      if (this.state === 'walking') this.cancelWalk();
    }
    let speed = this.keys.has('shift') ? 3.5 : 2.25;
    if (this.state === 'walking' && this.route.length && this.inputsEnabled) {
      const target = this.route[0];
      const dx = target.x - this.position.x;
      const dz = target.z - this.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.08) {
        this.route.shift();
        if (!this.route.length) { this.beginSitting(); return; }
      }
      inputX = dx / Math.max(distance, 0.001);
      inputZ = dz / Math.max(distance, 0.001);
      speed = Math.min(2.35, Math.max(0.42, distance * 5));
    } else {
      const length = Math.max(1, Math.hypot(inputX, inputZ));
      inputX /= length;
      inputZ /= length;
      const x = inputX * Math.cos(this.yaw) + inputZ * Math.sin(this.yaw);
      inputZ = -inputX * Math.sin(this.yaw) + inputZ * Math.cos(this.yaw);
      inputX = x;
    }
    this.velocity.x = damp(this.velocity.x, inputX * speed, 10, dt);
    this.velocity.y = damp(this.velocity.y, inputZ * speed, 10, dt);
    this.position = movePlayer(this.position, this.velocity.x * dt, this.velocity.y * dt);
    this.avatar.root.position.x = this.position.x;
    this.avatar.root.position.z = this.position.z;
    this.avatar.root.position.y = damp(this.avatar.root.position.y, floorHeight(this.position.x, this.position.z), 19, dt);
    const actualSpeed = this.velocity.length();
    if (actualSpeed > 0.07) this.avatar.root.rotation.y = turnToward(this.avatar.root.rotation.y, Math.atan2(-this.velocity.x, -this.velocity.y), 1 - Math.exp(-12 * dt));
    this.walkPhase += actualSpeed * dt * 5.1;
    this.sitAmount = 0;
    this.nearbySeat = null;
    let distance = 1.95;
    for (const seat of SEATS) {
      if (this.occupiedSeats.has(seat.id)) continue;
      const d = Math.hypot(seat.x - this.position.x, seat.z - this.position.z);
      if (d < distance && Math.abs(seat.elevation - floorHeight(this.position.x, this.position.z)) < 0.13) { this.nearbySeat = seat; distance = d; }
    }
  }

  private animateAvatar(dt: number) {
    poseAvatar(this.avatar, this.sitAmount, this.velocity.length(), this.walkPhase, dt);
    if (this.eatingProgress !== null && this.state === 'seated') {
      const bite = Math.sin(this.chewPhase) * 0.18;
      this.avatar.rightArm.rotation.x = 0.85 + bite * 0.3;
      this.avatar.rightForearm.rotation.x = 1.85 + bite;
      this.avatar.body.rotation.x = 0.025 + Math.sin(this.chewPhase * 0.6) * 0.015;
    }
    for (const remote of this.remotePlayers.values()) {
      const { avatar, target, receivedAt } = remote;
      const changing = Math.abs(avatar.root.position.x - target.x) + Math.abs(avatar.root.position.y - target.y)
        + Math.abs(avatar.root.position.z - target.z) + Math.abs(remote.sit - target.sit) > 0.003;
      const amount = 1 - Math.exp(-14 * dt);
      avatar.root.position.x = damp(avatar.root.position.x, target.x, 14, dt);
      avatar.root.position.y = damp(avatar.root.position.y, target.y, 16, dt);
      avatar.root.position.z = damp(avatar.root.position.z, target.z, 14, dt);
      avatar.root.rotation.y = turnToward(avatar.root.rotation.y, target.yaw, amount);
      remote.sit = damp(remote.sit, target.sit, 12, dt);
      const moving = performance.now() - receivedAt < 650;
      poseAvatar(avatar, remote.sit, moving ? target.speed : 0, target.phase, dt);
      if (changing || (moving && target.speed > 0.025)) this.renderer.shadowMap.needsUpdate = true;
    }
  }

  private drawPreview() {
    if (!this.previewCanvas) return;
    const canvas = this.previewCanvas;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.fillStyle = '#06090b';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const source = this.video && this.video.readyState >= 2 ? this.video : this.environment.filmTexture.image as HTMLCanvasElement;
    const width = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
    const height = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
    if (!width || !height) return;
    const scale = Math.min(canvas.width / width, canvas.height / height);
    try { context.drawImage(source, (canvas.width - width * scale) / 2, (canvas.height - height * scale) / 2, width * scale, height * scale); }
    catch { /* A temporarily unavailable frame should not interrupt the cinema. */ }
  }

  private updateCamera(dt: number) {
    const portrait = this.camera.aspect < 1;
    let targetFov = portrait ? 77 : 49;
    if (this.overview) {
      // Preserve the room's horizontal composition instead of cropping rows on narrow displays.
      const horizontalHalfFov = THREE.MathUtils.degToRad(portrait ? 35 : 40);
      targetFov = Math.max(49, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(horizontalHalfFov) / this.camera.aspect)));
      this.desiredCamera.set(5.78 + (this.reducedMotion ? 0 : Math.sin(this.time * 0.08) * 0.065), 4.58, 7.05);
      this.desiredTarget.set(portrait ? -0.8 : -0.55, 1.28, portrait ? -0.8 : -2.35);
    } else if (this.activeSeat && ['sitting', 'seated', 'standing'].includes(this.state)) {
      const seat = this.activeSeat;
      this.desiredCamera.set(seat.x * 0.96, seat.elevation + 2.42, Math.min(6.97, seat.z + 2.46));
      this.desiredTarget.set(0, 2.52, -6.83);
      const seatedVerticalFov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(26)) / this.camera.aspect));
      targetFov = portrait ? Math.max(77, seatedVerticalFov) : 46;
    } else {
      const elevation = this.avatar.root.position.y;
      const horizontal = Math.cos(this.pitch) * this.cameraDistance;
      this.desiredCamera.set(this.position.x + Math.sin(this.yaw) * horizontal, elevation + 1.35 + Math.sin(this.pitch) * this.cameraDistance, this.position.z + Math.cos(this.yaw) * horizontal);
      this.desiredTarget.set(this.position.x, elevation + 1.18, this.position.z);
      this.desiredCamera.y = THREE.MathUtils.clamp(this.desiredCamera.y, elevation + 0.85, 5.23);
      this.constrainCamera(this.desiredCamera);
    }
    const cameraSpeed = this.reducedMotion ? 8 : this.state === 'seated' || this.state === 'sitting' ? 2.15 : 4.5;
    this.camera.position.lerp(this.desiredCamera, 1 - Math.exp(-cameraSpeed * dt));
    if (!this.overview && (this.state === 'explore' || this.state === 'walking')) this.constrainCamera(this.camera.position);
    this.cameraTarget.lerp(this.desiredTarget, 1 - Math.exp(-cameraSpeed * dt));
    this.camera.lookAt(this.cameraTarget);
    const newFov = damp(this.camera.fov, targetFov, 3, dt);
    if (Math.abs(newFov - this.camera.fov) > 0.002) { this.camera.fov = newFov; this.camera.updateProjectionMatrix(); }
  }

  private constrainCamera(position: THREE.Vector3) {
    this.playerCameraOrigin.set(this.position.x, this.avatar.root.position.y + 1.5, this.position.z);
    this.rayDirection.subVectors(position, this.playerCameraOrigin);
    const distance = this.rayDirection.length();
    if (distance < 0.001) return;
    this.rayDirection.normalize();
    this.cameraRay.set(this.playerCameraOrigin, this.rayDirection);
    let nearest = distance;
    for (const { box } of this.cameraBoxes) {
      if (this.cameraRay.intersectBox(box, this.rayHit)) {
        const hitDistance = this.rayHit.distanceTo(this.playerCameraOrigin);
        if (hitDistance > 0.03 && hitDistance < nearest) nearest = Math.max(0.26, hitDistance - 0.12);
      }
    }
    if (nearest < distance) position.copy(this.playerCameraOrigin).addScaledVector(this.rayDirection, nearest);
  }

  private updateLighting(dt: number) {
    const movieMode = this.state === 'sitting' || this.state === 'seated';
    this.lightLevel = damp(this.lightLevel, movieMode ? 0.025 : 1, movieMode ? 0.88 : 1.3, dt);
    const e = this.environment;
    e.ambient.intensity = 0.45 * this.lightLevel;
    this.scene.environmentIntensity = 0.22 * this.lightLevel;
    for (const { light, intensity } of e.roomLights) light.intensity = intensity * this.lightLevel;
    e.materials.led.emissiveIntensity = 2.4 * this.lightLevel;
    e.materials.led.color.setRGB(0.88 * this.lightLevel, 0.54 * this.lightLevel, 0.22 * this.lightLevel);
    e.materials.ledSoft.emissiveIntensity = 0.85 * this.lightLevel;
    e.materials.fixture.emissiveIntensity = 3.4 * Math.pow(this.lightLevel, 1.65);
    e.materials.fixture.color.setRGB(this.lightLevel, this.lightLevel * 0.85, this.lightLevel * 0.6);
    if (this.video && this.video.readyState >= 2) {
      this.videoSampleTime += dt;
      if (this.videoSampleTime > 0.28) {
        this.videoSampleTime = 0;
        const ctx = this.videoSample.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          try {
          ctx.drawImage(this.video, 0, 0, 8, 8);
          const pixels = ctx.getImageData(0, 0, 8, 8).data;
          let r = 0, g = 0, b = 0;
          for (let i = 0; i < pixels.length; i += 4) { r += pixels[i]; g += pixels[i + 1]; b += pixels[i + 2]; }
          this.sampledColor.setRGB(r / 16320, g / 16320, b / 16320, THREE.SRGBColorSpace);
          } catch { this.sampledColor.copy(this.coolColor); }
        }
      }
      this.filmColor.lerp(this.sampledColor, 1 - Math.exp(-3 * dt));
    } else {
      this.filmColor.copy(this.coolColor).lerp(this.warmColor, (Math.sin(this.filmTime * 0.23) + 1) * 0.29);
    }
    e.screenLight.color.copy(this.filmColor);
    e.screenShadow.color.copy(this.filmColor);
    e.faceLight.color.copy(this.filmColor);
    e.screenLight.intensity = 3.0 + Math.sin(this.filmTime * 0.7) * 0.14;
    e.faceLight.intensity = (1 - this.lightLevel) * 0.8;
    e.faceLight.position.set(this.avatar.root.position.x, this.avatar.root.position.y + 1.45, this.avatar.root.position.z - 1.1);
    if (!this.video && !this.reducedMotion) {
      e.filmTexture.repeat.set(0.978, 0.978);
      e.filmTexture.offset.set(0.011 + Math.sin(this.filmTime * 0.034) * 0.009, 0.011 + Math.cos(this.filmTime * 0.025) * 0.007);
    }
    this.interactionRing.visible = this.state === 'explore' && this.nearbySeat !== null && !this.overview;
    if (this.nearbySeat) {
      const approach = seatApproach(this.nearbySeat);
      this.interactionRing.position.set(approach.x, this.nearbySeat.elevation + 0.014, approach.z);
      this.interactionRing.material.opacity = 0.35 + Math.sin(this.time * 2.0) * 0.08;
    }
  }

  private animate = (now: number) => {
    if (this.disposed) return;
    const elapsed = this.lastTime ? (now - this.lastTime) / 1000 : 1 / 60;
    const dt = Math.min(elapsed, 0.05);
    this.lastTime = now;
    this.time += dt;
    if (this.playing) this.filmTime += dt * this.playbackRate;
    this.updateMovement(dt);
    this.animateAvatar(dt);
    this.updateNpcs(dt);
    this.updateCafeteria(dt);
    this.updateServiceAndFood(dt);
    this.updateCamera(dt);
    this.updateLighting(dt);
    this.provider.render(this.camera);
    this.renderer.domElement.style.pointerEvents = this.provider.isInRoom && this.state === 'seated' ? 'none' : 'auto';
    if (this.velocity.lengthSq() > 0.00002 || this.state === 'sitting' || this.state === 'standing') this.renderer.shadowMap.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
    this.previewTime += dt;
    if (this.previewCanvas && this.previewTime > 1 / 24) { this.drawPreview(); this.previewTime = 0; }
    this.fpsFrames++;
    this.fpsTime += elapsed;
    this.snapshotTime += dt;
    if (this.fpsTime >= 1) {
      this.fps = Math.round(this.fpsFrames / this.fpsTime);
      const fastShare = this.sampledFrames > 0 ? this.fastFrames / this.sampledFrames : 0;
      if (this.fps > 80 && fastShare > 0.55) this.highRefresh = true;
      else if (this.fps < 55) this.highRefresh = false;
      this.fastFrames = 0;
      this.sampledFrames = 0;
      this.fpsTime = 0;
      this.fpsFrames = 0;
      const target = this.highRefresh ? 100 : 48;
      if (this.quality === 'auto' && this.time > 4) {
        if (this.fps < target && this.pixelRatio > 1) {
          this.pixelRatio = Math.max(1, this.pixelRatio - 0.15);
          this.renderer.setPixelRatio(this.pixelRatio);
        } else if (this.fps > target + 15 && this.pixelRatio < 1.5) {
          this.pixelRatio = Math.min(1.5, this.pixelRatio + 0.1);
          this.renderer.setPixelRatio(this.pixelRatio);
        }
      }
    }
    if (this.fpsTime < 0.01 && elapsed < 0.0105) this.fastFrames++;
    this.sampledFrames++;
    if (this.snapshotTime > 0.12) { this.publish(); this.snapshotTime = 0; }
    this.frameId = requestAnimationFrame(this.animate);
  };

  getSnapshot(): CinemaSnapshot {
    return {
      mode: this.state, seatId: this.activeSeat?.id ?? null, nearbySeatId: this.nearbySeat?.id ?? null,
      fps: this.fps, lightLevel: this.lightLevel, playing: this.playing, muted: this.muted,
      filmTitle: this.filmTitle, localFilm: !!this.video, currentTime: this.video?.currentTime ?? this.filmTime,
      duration: this.video && Number.isFinite(this.video.duration) ? this.video.duration : 0, overview: this.overview,
      sourceId: this.media.id, mediaKind: this.media.kind, volume: this.volume, rate: this.playbackRate, loop: this.loop,
      embed: this.media.kind === 'embed' ? this.media : null, providerStatus: this.provider.currentStatus,
      buffering: this.buffering, loading: this.loading, autoplayBlocked: this.autoplayBlocked, playbackError: this.playbackError, reservingSeat: this.reservingSeat,
      servicePhase: this.servicePhase, foodName: this.foodName, eatingProgress: this.eatingProgress, highRefresh: this.highRefresh,
      pose: { x: this.avatar.root.position.x, y: this.avatar.root.position.y, z: this.avatar.root.position.z, yaw: this.avatar.root.rotation.y, sit: this.sitAmount, phase: this.walkPhase, speed: this.velocity.length() },
    };
  }

  private publish() {
    if (!this.disposed) this.callbacks.onUpdate(this.getSnapshot());
  }

  dispose() {
    this.disposed = true;
    this.mediaGeneration++;
    this.reservationGeneration++;
    this.cancelPendingMedia?.();
    this.provider.dispose();
    this.previewCanvas = null;
    this.partyBridge = null;
    cancelAnimationFrame(this.frameId);
    this.validationWorker?.terminate();
    this.resizeObserver.disconnect();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.clearInput);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.host.removeEventListener('pointerdown', this.onPointerDown);
    this.host.removeEventListener('pointermove', this.onPointerMove);
    this.host.removeEventListener('pointerup', this.onPointerUp);
    this.host.removeEventListener('pointercancel', this.onPointerCancel);
    this.host.removeEventListener('wheel', this.onWheel);
    this.host.removeEventListener('contextmenu', this.onContextMenu);
    this.clearVideo();
    this.audioSources.forEach((source) => source.stop());
    void this.audioContext?.close();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        geometries.add(object.geometry);
        const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
        meshMaterials.forEach((material) => {
          materials.add(material);
          Object.values(material).forEach((value) => { if (value instanceof THREE.Texture) textures.add(value); });
        });
      }
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    textures.forEach((texture) => texture.dispose());
    this.environment.environmentTarget.dispose();
    this.environment.screenShadow.shadow.map?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
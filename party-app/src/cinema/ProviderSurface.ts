import * as THREE from 'three';
import { CSS3DObject, CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';
import type { EmbedMedia } from '../catalog/types';
import type { ProviderStatus } from './types';
import { validateEmbed } from '../catalog/servers';

export class ProviderSurface {
  private renderer = new CSS3DRenderer();
  private scene = new THREE.Scene();
  private plane: CSS3DObject;
  private iframe: HTMLIFrameElement | null = null;
  private media: EmbedMedia | null = null;
  private dock: HTMLDivElement | null = null;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private status: ProviderStatus = 'idle';
  private screen: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private onStatus: (status: ProviderStatus) => void;

  constructor(host: HTMLDivElement, screen: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>, onStatus: (status: ProviderStatus) => void) {
    this.screen = screen;
    this.onStatus = onStatus;
    this.renderer.domElement.className = 'provider-world-layer';
    host.prepend(this.renderer.domElement);
    const element = document.createElement('div');
    element.className = 'provider-world-screen';
    element.style.width = '1600px';
    element.style.height = '900px';
    this.plane = new CSS3DObject(element);
    this.plane.position.copy(screen.position);
    this.plane.scale.setScalar(7.8 / 1600);
    this.scene.add(this.plane);
    this.renderer.domElement.style.display = 'none';
    window.addEventListener('message', this.onMessage);
  }

  private setStatus(status: ProviderStatus) { this.status = status; this.onStatus(status); }

  load(media: EmbedMedia) {
    if (!validateEmbed(media)) throw new Error('The provider URL does not match the selected title and server.');
    this.clear();
    this.media = media;
    const frame = document.createElement('iframe');
    frame.className = 'provider-iframe';
    frame.title = `${media.title} - ${media.selection.server} player`;
    frame.allow = 'autoplay; fullscreen; encrypted-media; picture-in-picture';
    frame.allowFullscreen = true;
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    if (media.selection.preferences.sandbox) frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-presentation');
    frame.addEventListener('load', () => {
      if (frame !== this.iframe) return;
      if (this.timeout) clearTimeout(this.timeout);
      // Navigation is not proof that the provider has a playable video.
      this.setStatus('opened');
    });
    frame.addEventListener('error', () => { if (frame === this.iframe) this.setStatus('error'); });
    this.iframe = frame;
    this.setStatus('opening');
    frame.src = media.url;
    (this.dock ?? this.plane.element).appendChild(frame);
    this.updateMask();
    this.timeout = setTimeout(() => { if (this.status === 'opening') this.setStatus('slow'); }, 15000);
  }

  setDock(dock: HTMLDivElement | null) {
    this.dock = dock;
    if (this.iframe) {
      const parent = dock ?? this.plane.element;
      if (this.iframe.parentElement !== parent) {
        const stableParent = parent as HTMLElement & { moveBefore?: (node: Node, child: Node | null) => void };
        // Supported browsers preserve playback without creating a second iframe.
        try {
          if (stableParent.moveBefore && this.iframe.isConnected && parent.isConnected) stableParent.moveBefore(this.iframe, null);
          else parent.appendChild(this.iframe);
        } catch { parent.appendChild(this.iframe); }
      }
    }
    this.updateMask();
  }

  private updateMask() {
    const inRoom = !!this.media && !this.dock;
    this.renderer.domElement.style.display = inRoom ? 'block' : 'none';
    this.screen.material.opacity = inRoom ? 0 : 1;
    this.screen.material.blending = inRoom ? THREE.NoBlending : THREE.NormalBlending;
    this.screen.material.transparent = false;
    this.screen.material.fog = !inRoom;
    this.screen.material.premultipliedAlpha = inRoom;
    this.screen.material.needsUpdate = true;
  }

  private onMessage = (event: MessageEvent) => {
    if (!this.media || !this.iframe || event.source !== this.iframe.contentWindow || event.origin !== new URL(this.media.url).origin) return;
    let data: unknown = event.data;
    if (typeof data === 'string') { if (data.length > 10000) return; try { data = JSON.parse(data); } catch { return; } }
    if (data && typeof data === 'object' && (('event' in data && data.event === 'error') || ('type' in data && (data.type === 'error' || data.type === 'ERROR')))) this.setStatus('error');
  };

  resize(width: number, height: number) { this.renderer.setSize(width, height); }
  render(camera: THREE.Camera) { if (this.media && !this.dock) this.renderer.render(this.scene, camera); }
  get isInRoom() { return !!this.media && !this.dock; }
  get currentStatus() { return this.status; }
  reload() { if (this.media) this.load(this.media); }

  clear() {
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = null;
    this.iframe?.remove();
    this.iframe = null;
    this.media = null;
    this.status = 'idle';
    this.updateMask();
  }

  dispose() {
    this.clear();
    this.renderer.domElement.remove();
    window.removeEventListener('message', this.onMessage);
  }
}
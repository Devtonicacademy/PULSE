import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Loader2 } from 'lucide-react';
import { AvatarConfig, AvatarInstance, createAvatar } from './avatarModel';
import { ANCHORS } from '../../theme/tokens';

interface AvatarPreviewProps {
  config: AvatarConfig;
  className?: string;
}

/** A small Three.js stage showing the avatar; drag to turn it, otherwise it turns slowly */
export const AvatarPreview: React.FC<AvatarPreviewProps> = ({ config, className = 'relative' }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<AvatarInstance | null>(null);
  const configRef = useRef(config);
  configRef.current = config;
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;touch-action:none;cursor:grab';

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a4560, 1.9));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(2, 3, 3);
    const rim = new THREE.DirectionalLight(new THREE.Color(ANCHORS.signal), 1.6);
    rim.position.set(-3, 2, -2);
    scene.add(key, rim);

    const stage = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.62, 48),
      new THREE.MeshBasicMaterial({ color: ANCHORS.signal, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
    );
    stage.rotation.x = -Math.PI / 2;
    stage.position.y = 0.005;
    scene.add(stage);

    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 30);
    camera.position.set(0, 1.25, 6.2);
    camera.lookAt(0, 1.08, 0);

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = mount;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    // Drag to turn
    let dragging = false;
    let lastX = 0;
    let spin = 0.5;
    const down = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      renderer.domElement.setPointerCapture(e.pointerId);
      renderer.domElement.style.cursor = 'grabbing';
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      spin += (e.clientX - lastX) * 0.012;
      lastX = e.clientX;
    };
    const up = () => {
      dragging = false;
      renderer.domElement.style.cursor = 'grab';
    };
    renderer.domElement.addEventListener('pointerdown', down);
    renderer.domElement.addEventListener('pointermove', move);
    renderer.domElement.addEventListener('pointerup', up);
    renderer.domElement.addEventListener('pointercancel', up);

    let disposed = false;
    let frame = 0;
    const clock = new THREE.Clock();
    createAvatar(configRef.current)
      .then((avatar) => {
        if (disposed) {
          avatar.dispose();
          return;
        }
        avatarRef.current = avatar;
        scene.add(avatar.object);
        setState('ready');
      })
      .catch((err) => {
        console.warn('[PULSE] Avatar preview failed to load:', err);
        if (!disposed) setState('error');
      });

    const loop = () => {
      frame = requestAnimationFrame(loop);
      const dt = Math.min(clock.getDelta(), 0.1);
      const avatar = avatarRef.current;
      if (avatar) {
        if (!dragging) spin += dt * 0.5;
        avatar.object.rotation.y = spin;
        avatar.update(dt, 0, clock.elapsedTime);
      }
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', down);
      renderer.domElement.removeEventListener('pointermove', move);
      renderer.domElement.removeEventListener('pointerup', up);
      renderer.domElement.removeEventListener('pointercancel', up);
      avatarRef.current?.dispose();
      avatarRef.current = null;
      stage.geometry.dispose();
      (stage.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => {
    avatarRef.current?.setConfig(config);
  }, [config]);

  return (
    <div ref={mountRef} className={className}>
      {state === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center text-signal-300">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      )}
      {state === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400 text-center px-4">
          The 3D preview could not load. Your choices are still saved.
        </div>
      )}
    </div>
  );
};

export default AvatarPreview;

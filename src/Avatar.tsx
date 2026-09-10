import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import * as THREE from 'three';

type Props = { amplitude: MutableRefObject<number>; listening: boolean; thinking: boolean; reducedMotion: boolean };

export default function Avatar(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const state = useRef(props);
  state.current = props;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = container.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); }
    catch { setFailed(true); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    host.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-label', 'Animated male avatar of Ayush wearing a teal T-shirt');
    renderer.domElement.setAttribute('role', 'img');
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
    camera.position.set(0, 1.4, 7.6);
    camera.lookAt(0, 1.08, 0);
    scene.add(new THREE.HemisphereLight(0xdff6ff, 0x314767, 2.2));
    const key = new THREE.DirectionalLight(0xffdfc5, 4);
    key.position.set(-3, 4, 5); scene.add(key);
    const rim = new THREE.DirectionalLight(0x52dcca, 3.8);
    rim.position.set(3, 2, -2); scene.add(rim);
    const fill = new THREE.DirectionalLight(0x87a8ff, 1.4);
    fill.position.set(2, 1, 4); scene.add(fill);

    const person = new THREE.Group();
    scene.add(person);
    const skin = new THREE.MeshStandardMaterial({ color: 0x9d603e, roughness: 0.62 });
    const darkSkin = new THREE.MeshStandardMaterial({ color: 0x78432f, roughness: 0.75 });
    const hair = new THREE.MeshStandardMaterial({ color: 0x17181d, roughness: 0.85 });
    const shirt = new THREE.MeshStandardMaterial({ color: 0x247c83, roughness: 0.85 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x174e55, roughness: 0.8 });
    const white = new THREE.MeshStandardMaterial({ color: 0xfff3df, roughness: 0.4 });
    const iris = new THREE.MeshStandardMaterial({ color: 0x37261f, roughness: 0.4 });
    const black = new THREE.MeshStandardMaterial({ color: 0x090d12, roughness: 0.65 });
    const lip = new THREE.MeshStandardMaterial({ color: 0x6e352e, roughness: 0.8 });
    const light = new THREE.MeshStandardMaterial({ color: 0xadf1d9, emissive: 0x4ea78b, emissiveIntensity: 0.25 });
    const sphere = (parent: THREE.Object3D, material: THREE.Material, position: number[], scale: number[]) => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 32), material);
      mesh.position.set(position[0], position[1], position[2]);
      mesh.scale.set(scale[0], scale[1], scale[2]);
      parent.add(mesh); return mesh;
    };
    const capsule = (parent: THREE.Object3D, material: THREE.Material, radius: number, length: number, position: number[], rotation = 0) => {
      const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 10, 24), material);
      mesh.position.set(position[0], position[1], position[2]); mesh.rotation.z = rotation; parent.add(mesh); return mesh;
    };
    sphere(person, shirt, [0, 0.34, -0.04], [0.79, 0.81, 0.39]);
    capsule(person, shirt, 0.29, 0.32, [-0.75, 0.55, -0.02], -0.4);
    capsule(person, shirt, 0.29, 0.32, [0.75, 0.55, -0.02], 0.4);
    capsule(person, skin, 0.205, 0.45, [-0.93, 0.0, 0], -0.13);
    capsule(person, skin, 0.205, 0.45, [0.93, 0.0, 0], 0.13);
    sphere(person, trim, [0, 0.94, 0.005], [0.315, 0.14, 0.27]);
    capsule(person, skin, 0.225, 0.32, [0, 1.1, 0.0]);
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.055, 0.018), light);
    badge.position.set(0.37, 0.57, 0.339); badge.rotation.z = -0.12; person.add(badge);
    const badge2 = badge.clone(); badge2.position.set(0.37, 0.49, 0.35); badge2.scale.x = 0.55; person.add(badge2);

    const head = new THREE.Group(); head.position.set(0, 1.73, 0.03); person.add(head);
    sphere(head, skin, [0, 0, 0], [0.52, 0.67, 0.435]);
    sphere(head, skin, [0, -0.29, 0.065], [0.407, 0.365, 0.369]);
    for (const side of [-1, 1]) {
      sphere(head, skin, [side * 0.517, -0.035, 0.0], [0.1, 0.174, 0.103]);
      sphere(head, darkSkin, [side * 0.551, -0.035, 0.063], [0.048, 0.098, 0.045]);
    }
    sphere(head, hair, [0, 0.4, -0.075], [0.542, 0.377, 0.43]);
    sphere(head, hair, [-0.27, 0.48, 0.17], [0.31, 0.24, 0.29]);
    sphere(head, hair, [0.06, 0.58, 0.18], [0.34, 0.25, 0.28]);
    sphere(head, hair, [0.34, 0.46, 0.09], [0.205, 0.25, 0.305]);
    for (const side of [-1, 1]) sphere(head, hair, [side * 0.468, 0.185, -0.053], [0.06, 0.25, 0.255]);

    const eyes: THREE.Group[] = [];
    const brows: THREE.Mesh[] = [];
    for (const side of [-1, 1]) {
      const eye = new THREE.Group(); eye.position.set(side * 0.205, 0.025, 0.377); head.add(eye);
      sphere(eye, darkSkin, [0, 0, -0.005], [0.145, 0.085, 0.052]);
      sphere(eye, white, [0, 0.002, 0.025], [0.116, 0.059, 0.028]);
      sphere(eye, iris, [-side * 0.009, 0.002, 0.048], [0.042, 0.047, 0.019]);
      sphere(eye, black, [-side * 0.009, 0.002, 0.062], [0.022, 0.031, 0.007]);
      sphere(eye, white, [-0.014, 0.02, 0.069], [0.012, 0.011, 0.005]);
      eyes.push(eye);
      const brow = capsule(head, hair, 0.029, 0.169, [side * 0.209, 0.163, 0.386], Math.PI / 2 + side * 0.085);
      brows.push(brow);
    }
    sphere(head, skin, [0, -0.056, 0.405], [0.079, 0.159, 0.103]);
    sphere(head, skin, [0, -0.147, 0.476], [0.105, 0.078, 0.073]);
    for (const side of [-1, 1]) sphere(head, darkSkin, [side * 0.062, -0.177, 0.482], [0.024, 0.014, 0.017]);
    const mouth = new THREE.Group(); mouth.position.set(0, -0.322, 0.39); head.add(mouth);
    const mouthInside = sphere(mouth, black, [0, 0, 0], [0.145, 0.018, 0.018]);
    const upperLip = sphere(mouth, lip, [0, 0.02, 0.008], [0.158, 0.018, 0.015]);
    const lowerLip = sphere(mouth, lip, [0, -0.019, 0.008], [0.146, 0.024, 0.018]);
    const teeth = sphere(mouth, white, [0, 0.002, 0.015], [0.117, 0.009, 0.005]);
    sphere(head, darkSkin, [0, -0.51, 0.233], [0.155, 0.025, 0.055]);

    const platform = new THREE.Group(); platform.position.y = -0.53; scene.add(platform);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.38, 1.4, 0.055, 96), new THREE.MeshStandardMaterial({ color: 0x142c3c, metalness: 0.75, roughness: 0.5 }));
    platform.add(base);
    for (const radius of [1.34, 1.54, 1.72]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, radius === 1.34 ? 0.012 : 0.005, 8, 100), new THREE.MeshBasicMaterial({ color: radius === 1.34 ? 0x6ae6ce : 0x264954 }));
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.035; platform.add(ring);
    }
    const grid = new THREE.GridHelper(16, 40, 0x183e4a, 0x102330);
    grid.position.y = -0.64; scene.add(grid);
    scene.fog = new THREE.FogExp2(0x080e1b, 0.075);

    let pointerX = 0; let pointerY = 0;
    const pointer = (event: PointerEvent) => {
      const box = host.getBoundingClientRect();
      pointerX = ((event.clientX - box.left) / box.width - 0.5) * 0.36;
      pointerY = ((event.clientY - box.top) / box.height - 0.5) * 0.15;
    };
    const leave = () => { pointerX = 0; pointerY = 0; };
    host.addEventListener('pointermove', pointer);
    host.addEventListener('pointerleave', leave);
    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      renderer.setSize(width, height);
      camera.aspect = width / Math.max(height, 1);
      camera.position.z = camera.aspect < 0.85 ? 8.8 : 7.6;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize); observer.observe(host); resize();
    const start = performance.now();
    let animation = 0;
    const draw = () => {
      const t = (performance.now() - start) / 1000;
      const { amplitude, listening, thinking, reducedMotion } = state.current;
      const voice = amplitude.current;
      person.position.y = reducedMotion ? 0 : Math.sin(t * 1.6) * 0.018;
      const entrance = reducedMotion ? 1 : Math.min(1, t / 1.2);
      person.scale.setScalar(0.9 + 0.1 * (1 - Math.pow(1 - entrance, 3)));
      head.rotation.y = THREE.MathUtils.lerp(head.rotation.y, reducedMotion ? 0 : pointerX + Math.sin(t * 0.7) * 0.035, 0.045);
      head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, reducedMotion ? 0 : pointerY + (listening ? -0.07 : 0) + voice * 0.03, 0.06);
      head.rotation.z = reducedMotion ? 0 : (thinking ? Math.sin(t * 1.3) * 0.045 : Math.sin(t * 0.55) * 0.018);
      const blink = !reducedMotion && t % 4.7 < 0.14 ? 0.12 : 1;
      eyes.forEach((eye) => { eye.scale.y = THREE.MathUtils.lerp(eye.scale.y, blink, 0.5); });
      brows.forEach((brow, index) => {
        brow.position.y = 0.163 + (reducedMotion ? 0 : voice * 0.045 + (listening ? 0.028 : 0));
        brow.rotation.z = Math.PI / 2 + (index === 0 ? -1 : 1) * (0.085 + voice * 0.09);
      });
      const opening = reducedMotion ? 0 : voice;
      mouthInside.scale.y = 0.018 + opening * 0.092;
      upperLip.position.y = 0.019 + opening * 0.025;
      lowerLip.position.y = -0.019 - opening * 0.105;
      teeth.position.y = 0.002 + opening * 0.02;
      renderer.render(scene, camera);
      animation = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(animation); observer.disconnect();
      host.removeEventListener('pointermove', pointer); host.removeEventListener('pointerleave', leave);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material: THREE.Material) => material.dispose());
        }
      });
      renderer.dispose(); renderer.domElement.remove();
    };
  }, []);

  return <div ref={container} className="avatar-canvas" data-testid="avatar-scene">
    {failed && <div className="avatar-fallback" role="img" aria-label="Ayush Dodal avatar placeholder">AD</div>}
  </div>;
}

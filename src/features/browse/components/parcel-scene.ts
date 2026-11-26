import * as THREE from "three";

// ฉาก 3 มิติของส่วนต้อนรับ: พัสดุกระโดดจากร้านไปบ้านบนแผ่นพื้นกลม วาดจากรูปทรงพื้นฐาน ไม่โหลดไฟล์โมเดล

export type SceneColors = { ground: string; shop: string; home: string; roof: string; parcel: string; ink: string; leaf: string; light: string };

export type ParcelScene = { setRunning(running: boolean): void; dispose(): void };

const TRIP_MS = 3200;
const REST_MS = 900;
const FROM_X = -1.7;
const TO_X = 1.7;
/** ครึ่งความกว้างของฉากที่กล้องต้องเห็นครบ */
const HALF_WIDTH = 4.1;

export function startParcelScene(canvas: HTMLCanvasElement, colors: SceneColors): ParcelScene {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  const meshes: THREE.Mesh[] = [];

  const solid = (geometry: THREE.BufferGeometry, color: string, at: [number, number, number], parent: THREE.Object3D = scene) => {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true }));
    mesh.position.set(...at);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    meshes.push(mesh);
    return mesh;
  };
  const box = (size: [number, number, number], color: string, at: [number, number, number], parent?: THREE.Object3D) =>
    solid(new THREE.BoxGeometry(...size), color, at, parent);

  solid(new THREE.CylinderGeometry(3.8, 3.8, 0.3, 72), colors.ground, [0, -0.15, 0]);

  // ร้าน: ตัวอาคาร กันสาด ประตู และป้าย
  box([1.6, 1.2, 1.3], colors.shop, [-2.4, 0.6, -0.2]);
  box([1.8, 0.14, 0.7], colors.parcel, [-2.4, 1.05, 0.7]).rotation.set(0.35, 0, 0);
  box([0.42, 0.7, 0.06], colors.ink, [-2.75, 0.35, 0.47]);
  box([0.6, 0.4, 0.06], colors.light, [-2.1, 0.5, 0.47]);

  // บ้าน: ตัวบ้าน หลังคา และประตู
  box([1.4, 1.05, 1.3], colors.home, [2.4, 0.52, -0.2]);
  const roof = solid(new THREE.ConeGeometry(1.25, 0.8, 4), colors.roof, [2.4, 1.45, -0.2]);
  roof.rotation.set(0, Math.PI / 4, 0);
  box([0.4, 0.65, 0.06], colors.ink, [2.4, 0.32, 0.47]);

  for (const [x, z, height] of [
    [-0.9, -2, 1.1],
    [0.7, -2.5, 1.4],
    [1.6, 2.3, 0.9],
    [-1.8, 2.4, 1],
  ]) {
    box([0.14, 0.4, 0.14], colors.ink, [x, 0.2, z]);
    solid(new THREE.ConeGeometry(0.42, height, 7), colors.leaf, [x, 0.4 + height / 2, z]);
  }

  // เส้นประบนพื้นจากร้านถึงบ้าน โค้งเข้าหากล้อง
  const pathZ = (t: number) => 0.9 + Math.sin(t * Math.PI) * 1.1;
  const pathX = (t: number) => FROM_X + (TO_X - FROM_X) * t;
  for (let i = 0; i <= 12; i += 1) {
    const t = i / 12;
    const dash = box([0.26, 0.03, 0.09], colors.leaf, [pathX(t), 0.02, pathZ(t)]);
    dash.rotation.set(0, -Math.atan2(Math.cos(t * Math.PI) * 1.1 * Math.PI, TO_X - FROM_X), 0);
    dash.castShadow = false;
  }

  const parcel = new THREE.Group();
  box([0.62, 0.5, 0.62], colors.parcel, [0, 0, 0], parcel);
  box([0.16, 0.51, 0.63], colors.ink, [0, 0, 0], parcel);
  box([0.26, 0.02, 0.2], colors.shop, [0.16, 0.26, 0.16], parcel);
  scene.add(parcel);

  scene.add(new THREE.HemisphereLight(colors.light, colors.ground, 1.5));
  const sun = new THREE.DirectionalLight(colors.light, 2.2);
  sun.position.set(3.5, 8, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.radius = 6;
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6 });
  scene.add(sun);

  const pointer = { x: 0, y: 0 };
  const onPointer = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    pointer.y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
  };
  canvas.addEventListener("pointermove", onPointer);

  let sway = { x: 0, y: 0 };
  let elapsed = 0;
  let last = 0;
  let frame = 0;

  function draw() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    const phase = elapsed % (TRIP_MS + REST_MS);
    const t = Math.min(phase / TRIP_MS, 1);
    const eased = t * t * (3 - 2 * t);
    const hop = Math.abs(Math.sin(eased * Math.PI * 4));
    parcel.position.set(pathX(eased), 0.27 + hop * 0.55, pathZ(eased));
    parcel.rotation.set(0, eased * Math.PI * 2, (1 - hop) * 0.04);
    parcel.scale.set(1 + (1 - hop) * 0.06, 1 - (1 - hop) * 0.08, 1 + (1 - hop) * 0.06);

    sway = { x: sway.x + (pointer.x - sway.x) * 0.06, y: sway.y + (pointer.y - sway.y) * 0.06 };
    const distance = Math.max(11, HALF_WIDTH / (Math.tan((15 * Math.PI) / 180) * camera.aspect));
    camera.position.set(sway.x * 1.4, 5.4 - sway.y * 0.7, distance);
    camera.lookAt(0, 0.5, 0);
    renderer.render(scene, camera);
  }

  function tick(now: number) {
    elapsed += Math.min(now - last, 50);
    last = now;
    draw();
    frame = requestAnimationFrame(tick);
  }

  // เฟรมแรกวาดตอนพัสดุอยู่กลางทาง ฉากที่ยังไม่เล่นจึงเล่าเรื่องครบ
  elapsed = TRIP_MS * 0.56;
  draw();

  return {
    setRunning(running) {
      cancelAnimationFrame(frame);
      if (!running) return;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    },
    dispose() {
      cancelAnimationFrame(frame);
      canvas.removeEventListener("pointermove", onPointer);
      for (const mesh of meshes) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      renderer.dispose();
    },
  };
}

// แพ็กเกจ three ไม่มีชนิดข้อมูลมาด้วย ประกาศเฉพาะส่วนที่ฉากพัสดุของหน้าแรกใช้
declare module "three" {
  export class Vector3 {
    x: number;
    y: number;
    z: number;
    set(x: number, y: number, z: number): this;
  }
  export class Euler {
    x: number;
    y: number;
    z: number;
    set(x: number, y: number, z: number): this;
  }
  export class Object3D {
    position: Vector3;
    rotation: Euler;
    scale: Vector3;
    castShadow: boolean;
    receiveShadow: boolean;
    add(...objects: Object3D[]): this;
    lookAt(x: number, y: number, z: number): void;
  }
  export class Group extends Object3D {}
  export class Scene extends Object3D {}
  export class BufferGeometry {
    dispose(): void;
  }
  export class BoxGeometry extends BufferGeometry {
    constructor(width: number, height: number, depth: number);
  }
  export class ConeGeometry extends BufferGeometry {
    constructor(radius: number, height: number, radialSegments: number);
  }
  export class CylinderGeometry extends BufferGeometry {
    constructor(radiusTop: number, radiusBottom: number, height: number, radialSegments: number);
  }
  export class Material {
    dispose(): void;
  }
  export class MeshStandardMaterial extends Material {
    constructor(parameters: { color: string; roughness?: number; flatShading?: boolean });
  }
  export class Mesh extends Object3D {
    constructor(geometry: BufferGeometry, material: Material);
    geometry: BufferGeometry;
    material: Material;
  }
  export class PerspectiveCamera extends Object3D {
    constructor(fov: number, aspect: number, near: number, far: number);
    aspect: number;
    updateProjectionMatrix(): void;
  }
  export class HemisphereLight extends Object3D {
    constructor(skyColor: string, groundColor: string, intensity: number);
  }
  export class DirectionalLight extends Object3D {
    constructor(color: string, intensity: number);
    shadow: { mapSize: { set(width: number, height: number): void }; radius: number; camera: { left: number; right: number; top: number; bottom: number } };
  }
  export class WebGLRenderer {
    constructor(parameters: { canvas: HTMLCanvasElement; alpha: boolean; antialias: boolean });
    shadowMap: { enabled: boolean; type: number };
    setPixelRatio(ratio: number): void;
    setSize(width: number, height: number, updateStyle: boolean): void;
    render(scene: Scene, camera: PerspectiveCamera): void;
    dispose(): void;
  }
  export const PCFSoftShadowMap: number;
}

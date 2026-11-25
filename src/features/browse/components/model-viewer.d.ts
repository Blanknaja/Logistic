import type { ModelViewerElement } from "@google/model-viewer";
import type { DetailedHTMLProps, HTMLAttributes } from "react";

// แพ็กเกจประกาศชนิดของ <model-viewer> ให้ DOM อย่างเดียว ไม่ได้ประกาศให้ JSX ชื่อที่มีขีดกลางเช่น ar-scale TypeScript ไม่ตรวจอยู่แล้ว
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": DetailedHTMLProps<HTMLAttributes<ModelViewerElement>, ModelViewerElement> & {
        src: string;
        alt: string;
        ar?: boolean;
        loading?: "auto" | "lazy" | "eager";
      };
    }
  }
}

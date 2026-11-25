import type { ModelViewerElement } from "@google/model-viewer";
import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": DetailedHTMLProps<HTMLAttributes<ModelViewerElement>, ModelViewerElement> & {
        src: string;
        alt: string;
        loading?: "auto" | "lazy" | "eager";
        "camera-controls"?: boolean;
        "touch-action"?: "pan-y" | "pan-x" | "none";
        ar?: boolean;
        "ar-scale"?: "auto" | "fixed";
      };
    }
  }
}

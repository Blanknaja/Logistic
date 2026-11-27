/** attribute ของไอคอนตะกร้าในแถบด้านบน ปลายทางของรูปที่ลอยไป */
export const CART_TARGET = "data-cart-target";

const FLIGHT_MS = 400;

/**
 * รูปย่อของสินค้าลอยจากปุ่มที่กดไปไอคอนตะกร้า บอกว่าของเข้าตะกร้าแล้ว
 * ไม่ทำอะไรถ้าผู้ใช้ขอลดการขยับ หรือหาไอคอนตะกร้าไม่เจอ ข้อความใต้ปุ่มยังบอกผลครบ
 */
export function flyToCart(from: Element, imageSrc: string | null): void {
  const target = document.querySelector(`[${CART_TARGET}]`);
  if (!target || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const start = from.getBoundingClientRect();
  const end = target.getBoundingClientRect();
  const thumb = document.createElement(imageSrc ? "img" : "span");
  if (imageSrc) (thumb as HTMLImageElement).src = imageSrc;
  thumb.className = "fly-thumb";
  thumb.setAttribute("aria-hidden", "true");
  document.body.append(thumb);
  const half = thumb.offsetWidth / 2;
  const at = (rect: DOMRect) => `translate(${rect.left + rect.width / 2 - half}px, ${rect.top + rect.height / 2 - half}px)`;
  const lift = Math.min(start.top, end.top) - 48;
  thumb
    .animate(
      [
        { transform: `${at(start)} scale(1)`, opacity: 1 },
        { transform: `translate(${(start.left + end.left) / 2}px, ${lift}px) scale(0.8)`, opacity: 1, offset: 0.55 },
        { transform: `${at(end)} scale(0.25)`, opacity: 0.4 },
      ],
      { duration: FLIGHT_MS, easing: "cubic-bezier(0.45, 0, 0.55, 1)" },
    )
    .finished.finally(() => thumb.remove());
}

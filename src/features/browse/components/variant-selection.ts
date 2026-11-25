import type { ProductDetail, ProductOption, ProductVariant } from "@/features/browse/server/product-detail";
import { formatBaht, formatNumber } from "@/shared/format";

/** ค่าตัวเลือกที่ผู้ซื้อเลือก เรียงตามลำดับตัวเลือก ยังไม่เลือกเป็น null */
export type Selection = (number | null)[];

type Product = Pick<ProductDetail, "options" | "variants">;

/** แบบย่อยที่ตรงกับค่าที่เลือก หรือ null ถ้ายังเลือกไม่ครบ */
export function findVariant(product: Product, selection: Selection): ProductVariant | null {
  if (product.options.some((_, i) => selection[i] == null)) return null;
  return product.variants.find((v) => product.options.every((_, i) => v.valueIds[i] === selection[i])) ?? null;
}

export function missingOptionMessage(options: ProductOption[], selection: Selection): string | null {
  const missing = options.find((_, i) => selection[i] == null);
  return missing ? `กรุณาเลือก${missing.name}` : null;
}

export function priceText(variants: Pick<ProductVariant, "price">[]): string {
  const prices = variants.map((v) => v.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? formatBaht(min) : `${formatBaht(min)} - ${formatBaht(max)}`;
}

export function stockText(stock: number): string {
  return stock > 0 ? `เหลือ ${formatNumber(stock)} ชิ้น` : "สินค้าหมด";
}

/** ค่าตัวเลือกนี้ไม่มีแบบย่อยที่ยังมีสต็อก เมื่อรวมกับค่าที่เลือกไว้แล้วในตัวเลือกอื่น */
export function isValueSoldOut(product: Product, selection: Selection, optionIndex: number, valueId: number): boolean {
  return !product.variants.some(
    (v) =>
      v.stock > 0 &&
      v.valueIds[optionIndex] === valueId &&
      selection.every((selected, i) => i === optionIndex || selected == null || v.valueIds[i] === selected),
  );
}

/** เหตุที่ปุ่ม "ใส่ตะกร้า" กดไม่ได้ หรือ null ถ้ากดได้ */
export function blockedReason(product: Product, selection: Selection, isOwnShop: boolean): string | null {
  if (isOwnShop) return "ซื้อสินค้าจากร้านตัวเองไม่ได้";
  const variant = findVariant(product, selection);
  const soldOut = variant ? variant.stock <= 0 : product.variants.every((v) => v.stock <= 0);
  return soldOut ? "สินค้าหมด" : null;
}

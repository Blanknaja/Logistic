"use client";

import Link from "next/link";
import { useState } from "react";
import { formatBaht } from "@/shared/format";
import { Morph, productImageName } from "@/shared/ui/transitions";
import { ProductImage } from "./product-image";
import styles from "./browse.module.css";

type Card = {
  id: number;
  name: string;
  price: number;
  coverUrl: string | null;
  soldOut: boolean;
  shopName?: string;
  categoryId?: number | null;
};

/**
 * การ์ดสินค้าในรายการ: รูป ชื่อ ราคา และชื่อร้าน หน้าร้านไม่ส่งชื่อร้านเพราะเป็นร้านเดียวกันทั้งหน้า
 * รูปขยายเป็นรูปใหญ่ของหน้าสินค้าตอนเปลี่ยนหน้า ซึ่งเกิดเมื่อหน้าสินค้าโหลดไว้ก่อนแล้วเท่านั้น
 * จึงโหลดหน้าสินค้าทั้งหน้าตั้งแต่ผู้ซื้อชี้ แตะ หรือโฟกัสการ์ด
 * morph เป็น false เมื่อสินค้าเดียวกันมีการ์ดอื่นในหน้านี้ใช้ชื่อรูปไปแล้ว ชื่อซ้ำทำให้การเปลี่ยนหน้าไม่ขยับเลย
 */
export function ProductCard({ item, morph = true }: { item: Card; morph?: boolean }) {
  const [wanted, setWanted] = useState(false);
  const warm = () => setWanted(true);
  const image = <ProductImage src={item.coverUrl} alt="" categoryId={item.categoryId} />;
  return (
    <Link
      href={`/products/${item.id}`}
      prefetch={wanted ? true : null}
      onPointerEnter={warm}
      onTouchStart={warm}
      onFocus={warm}
      className={`card lift ${styles.card}`}
    >
      <span className={styles.cardMedia}>{morph ? <Morph name={productImageName(item.id)}>{image}</Morph> : image}</span>
      <span className={styles.cardBody}>
        <span className={styles.cardName}>{item.name}</span>
        <span className={styles.cardPrice}>
          {formatBaht(item.price)}
          {item.soldOut && <span className="badge badge-alert">สินค้าหมด</span>}
        </span>
        {item.shopName && <span className={styles.muted}>{item.shopName}</span>}
      </span>
    </Link>
  );
}

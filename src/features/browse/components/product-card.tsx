import Link from "next/link";
import { CardRating } from "@/features/review/components/rating";
import type { Rating } from "@/features/review/rules";
import { formatBaht } from "@/shared/format";
import { ProductImage } from "./product-image";
import styles from "./browse.module.css";

type Card = { id: number; name: string; price: number; coverUrl: string | null; soldOut: boolean; shopName?: string; rating?: Rating };

/** การ์ดสินค้าในรายการ: รูป ชื่อ ราคา และชื่อร้าน หน้าร้านไม่ส่งชื่อร้านเพราะเป็นร้านเดียวกันทั้งหน้า */
export function ProductCard({ item }: { item: Card }) {
  return (
    <Link href={`/products/${item.id}`} className={styles.card}>
      <ProductImage src={item.coverUrl} alt="" />
      <span className={styles.cardBody}>
        <span className={styles.cardName}>{item.name}</span>
        <span>
          {formatBaht(item.price)}
          {item.soldOut && <span className={styles.soldOut}> สินค้าหมด</span>}
        </span>
        <CardRating rating={item.rating} />
        {item.shopName && <span className={styles.muted}>{item.shopName}</span>}
      </span>
    </Link>
  );
}

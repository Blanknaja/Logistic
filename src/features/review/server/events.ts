import type { Db } from "@/shared/db";

// จุดต่อของแจ้งเตือนที่เกิดจากรีวิว (NTF-009 NTF-012) ตอนนี้ยังไม่ทำอะไร
// แต่ละฟังก์ชันถูกเรียกที่เดียวใน reviews.ts ภายในการบันทึกเดียวกับเหตุการณ์นั้น

type ReviewEvent = (db: Db, reviewId: number, now: Date) => void;

/** ผู้ซื้อส่งรีวิวใหม่ ร้านของสินค้านั้นควรได้แจ้งเตือน */
export const onReviewPosted: ReviewEvent = () => {};

/** ร้านตอบรีวิวครั้งแรก ผู้ซื้อเจ้าของรีวิวควรได้แจ้งเตือน การแก้คำตอบไม่เรียก */
export const onReviewReplied: ReviewEvent = () => {};

/** ผู้ดูแลแพลตฟอร์มซ่อนรีวิว ผู้ซื้อเจ้าของรีวิวควรได้แจ้งเตือน */
export const onReviewHidden: ReviewEvent = () => {};

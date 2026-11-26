/** หน้าเขียนรีวิวของรายการในคำสั่งซื้อหนึ่งรายการ และหน้าที่แสดงรีวิวของตัวเองหลังส่งแล้ว */
export const reviewHref = (orderNo: string, orderItemId: number) => `/orders/${encodeURIComponent(orderNo)}/review/${orderItemId}`;

export const SELLER_REVIEWS_PATH = "/seller/reviews";
export const ADMIN_REVIEWS_PATH = "/admin/reviews";

import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { createProductAction } from "@/features/product-listing/actions";
import { ProductForm } from "@/features/product-listing/components/product-form";
import { requireShop } from "@/features/shop/require-shop";
import { listCategories } from "@/features/product-listing/server/categories";
import { getDb } from "@/shared/db";
import { PageReveal } from "@/shared/ui/transitions";

export const metadata: Metadata = { title: "เพิ่มสินค้า" };

export default async function NewProductPage() {
  await requireShop("/seller/products/new");
  return (
    <PageReveal>
      <>
        <h1>เพิ่มสินค้า</h1>
        <ProductForm categories={listCategories(getDb())} save={createProductAction.bind(null, randomUUID())} />
      </>
    </PageReveal>
  );
}

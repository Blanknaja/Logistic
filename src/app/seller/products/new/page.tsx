import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { createProductAction } from "@/features/product-listing/actions";
import { ProductForm } from "@/features/product-listing/components/product-form";
import { requireSeller } from "@/features/product-listing/require-seller";
import { listCategories } from "@/features/product-listing/server/categories";
import { getDb } from "@/shared/db";

export const metadata: Metadata = { title: "เพิ่มสินค้า" };

export default async function NewProductPage() {
  await requireSeller("/seller/products/new");
  return (
    <>
      <h1>เพิ่มสินค้า</h1>
      <ProductForm categories={listCategories(getDb())} save={createProductAction.bind(null, randomUUID())} />
    </>
  );
}

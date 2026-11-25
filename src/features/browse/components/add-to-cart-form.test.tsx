import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { AddToCartForm } from "@/features/browse/components/add-to-cart-form";
import { ProductDetailSkeleton } from "@/features/browse/components/skeletons";
import type { ProductDetail } from "@/features/browse/server/product-detail";

const bag: ProductDetail = {
  id: 7,
  name: "กระเป๋าผ้าลายช้าง",
  description: "ผ้าฝ้ายทอมือ",
  category: { id: 2, name: "กระเป๋าและรองเท้า" },
  shop: { id: 3, name: "บ้านสวนผ้าไทย" },
  images: [],
  model: null,
  options: [],
  variants: [{ id: 70, valueIds: [], label: "", price: 290, stock: 15 }],
};

const shirt: ProductDetail = {
  ...bag,
  id: 8,
  name: "เสื้อยืดคอกลม",
  options: [
    { id: 1, name: "สี", values: [{ id: 11, value: "แดง" }, { id: 12, value: "ดำ" }] },
    { id: 2, name: "ขนาด", values: [{ id: 21, value: "M" }, { id: 22, value: "L" }] },
  ],
  variants: [
    { id: 81, valueIds: [11, 21], label: "แดง M", price: 199, stock: 3 },
    { id: 82, valueIds: [11, 22], label: "แดง L", price: 209, stock: 1 },
    { id: 83, valueIds: [12, 21], label: "ดำ M", price: 199, stock: 2 },
    { id: 84, valueIds: [12, 22], label: "ดำ L", price: 219, stock: 0 },
  ],
};

const loginHref = "/login?next=%2Fproducts%2F7";

function render(product: ProductDetail, viewer: { signedIn: boolean; isOwnShop?: boolean }) {
  return renderToStaticMarkup(
    <AddToCartForm
      product={product}
      signedIn={viewer.signedIn}
      isOwnShop={viewer.isOwnShop ?? false}
      loginHref={loginHref}
      addToCart={async () => ({ ok: true, message: "ใส่ตะกร้าแล้ว" })}
    />,
  );
}

const enabledButton = /<button type="submit" class="button">ใส่ตะกร้า<\/button>/;
const disabledButton = /<button type="submit" class="button" disabled="">ใส่ตะกร้า<\/button>/;

describe("BRW-008 หน้ารายละเอียดสินค้า", () => {
  test("สินค้าไม่มีตัวเลือก แสดงราคา สต็อก ช่องจำนวนที่เริ่มที่ 1 และปุ่มใส่ตะกร้าที่กดได้", () => {
    const html = render(bag, { signedIn: true });

    expect(html).toContain("฿290");
    expect(html).toContain("เหลือ 15 ชิ้น");
    expect(html).toMatch(/name="quantity" value="1"/);
    expect(html).toMatch(enabledButton);
  });

  test("โครงสีเทาของหน้ารายละเอียดระหว่างรอข้อมูล", () => {
    expect(renderToStaticMarkup(<ProductDetailSkeleton />)).toContain('role="status"');
  });
});

describe("BRW-009 ตัวเลือกและสต็อกที่เหลือ", () => {
  test("ก่อนเลือกเห็นช่วงราคา ค่าตัวเลือกทั้งหมด และแบบย่อยที่หมดเป็นสีจางพร้อมคำว่าสินค้าหมด", () => {
    const html = render(shirt, { signedIn: true });

    expect(html).toContain("฿199 - ฿219");
    for (const value of ["แดง", "ดำ", "M", "L"]) expect(html).toContain(`/>${value}</label>`);
    expect(html).toMatch(/<li class="_faded_\w+"><span>ดำ L<\/span><span>฿219 · สินค้าหมด<\/span><\/li>/);
    expect(html).toMatch(/<li><span>แดง M<\/span><span>฿199 · เหลือ 3 ชิ้น<\/span><\/li>/);
  });

  test("สินค้าหมด ปุ่มใส่ตะกร้ากดไม่ได้ ทั้งคนที่เข้าสู่ระบบแล้วและยังไม่เข้าสู่ระบบ", () => {
    const soldOut = { ...bag, variants: [{ ...bag.variants[0], stock: 0 }] };
    for (const signedIn of [true, false]) {
      const html = render(soldOut, { signedIn });
      expect(html).toContain("สินค้าหมด");
      expect(html).toMatch(disabledButton);
    }
  });
});

describe("BRW-010 ปุ่มใส่ตะกร้า", () => {
  test("สินค้าของร้านอื่นที่ยังเลือกตัวเลือกไม่ครบ ปุ่มยังกดได้ เพื่อให้เห็นข้อความตาม CRT-001", () => {
    expect(render(shirt, { signedIn: true })).toMatch(enabledButton);
  });

  test("สินค้าของร้านตัวเอง ปุ่มกดไม่ได้และมีข้อความบอก", () => {
    const html = render(bag, { signedIn: true, isOwnShop: true });
    expect(html).toMatch(disabledButton);
    expect(html).toContain("ซื้อสินค้าจากร้านตัวเองไม่ได้");
  });
});

describe("BRW-014 ใช้ได้โดยไม่ต้องเข้าสู่ระบบ", () => {
  test("คนที่ยังไม่เข้าสู่ระบบเห็นราคา ตัวเลือก และสต็อกครบเหมือนคนที่เข้าสู่ระบบ", () => {
    const strip = (html: string) => html.replace(/<(a|button)[^>]*>ใส่ตะกร้า<\/(a|button)>/, "");
    expect(strip(render(shirt, { signedIn: false }))).toBe(strip(render(shirt, { signedIn: true })));
  });

  test("คนที่ยังไม่เข้าสู่ระบบกดใส่ตะกร้า ไปหน้าเข้าสู่ระบบที่พากลับมาหน้าสินค้าเดิม โดยไม่ส่งอะไรให้ตะกร้า", () => {
    const html = render(bag, { signedIn: false });
    expect(html).toContain(`<a class="button" href="${loginHref.replaceAll("&", "&amp;")}">ใส่ตะกร้า</a>`);
    expect(html).not.toMatch(/<button type="submit"/);
  });
});

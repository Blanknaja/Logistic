import { beforeEach, describe, expect, test } from "vitest";
import type { Db } from "@/shared/db";
import { addAccount, addOrder, addProduct } from "@/shared/db/builders";
import { createTestDb } from "@/shared/db/testing";
import {
  ADDRESS_GONE,
  ADDRESS_LIMIT,
  createAddress,
  deleteAddress,
  fullAddress,
  getAddress,
  listAddresses,
  MAX_ADDRESSES,
  setDefaultAddress,
  updateAddress,
  type AddressInput,
} from "./addresses";
import { PROVINCES } from "./provinces";

let db: Db;
beforeEach(() => {
  db = createTestDb();
});

/** เวลาประเทศไทยของวันที่ 2026-11-24 */
const at = (time: string) => new Date(`2026-11-24T${time}:00+07:00`);

const somying: AddressInput = {
  recipientName: "สมหญิง ใจดี",
  phone: "0812345678",
  address: "99/1 ถนนนิมมานเหมินท์",
  subdistrict: "สุเทพ",
  district: "เมืองเชียงใหม่",
  province: "เชียงใหม่",
  postcode: "50200",
};

function add(accountId: number, address: string, time: string, extra: Partial<AddressInput> = {}): number {
  const result = createAddress(db, accountId, { ...somying, address, ...extra }, at(time));
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.id;
}

const names = (accountId: number) => listAddresses(db, accountId).map((a) => [a.address, a.isDefault]);

test("รายชื่อจังหวัดมีครบ 77 จังหวัด ไม่ซ้ำ", () => {
  expect(PROVINCES).toHaveLength(77);
  expect(new Set(PROVINCES).size).toBe(77);
});

describe("CHK-001 รายการที่อยู่จัดส่ง", () => {
  test("CHK-001 ที่อยู่หลักอยู่บนสุด ตามด้วยที่อยู่อื่นเรียงจากที่เพิ่มล่าสุด", () => {
    const somchai = addAccount(db).id;
    add(somchai, "บ้าน", "08:00");
    add(somchai, "ที่ทำงาน", "09:00");
    add(somchai, "บ้านแม่", "10:00");

    expect(names(somchai)).toEqual([
      ["บ้าน", true],
      ["บ้านแม่", false],
      ["ที่ทำงาน", false],
    ]);
  });

  test("CHK-001 แต่ละแห่งมีชื่อผู้รับ เบอร์โทร และที่อยู่เต็ม", () => {
    const somchai = addAccount(db).id;
    add(somchai, "99/1 ถนนนิมมานเหมินท์", "08:00");

    const [address] = listAddresses(db, somchai);
    expect(address).toMatchObject({ recipientName: "สมหญิง ใจดี", phone: "0812345678" });
    expect(fullAddress(address)).toBe("99/1 ถนนนิมมานเหมินท์ สุเทพ เมืองเชียงใหม่ เชียงใหม่ 50200");
  });

  test("CHK-001 บัญชีที่ยังไม่มีที่อยู่ได้รายการว่าง", () => {
    expect(listAddresses(db, addAccount(db).id)).toEqual([]);
  });

  test("CHK-001 ไม่เห็นที่อยู่ของบัญชีอื่น", () => {
    const somchai = addAccount(db).id;
    const other = addAccount(db).id;
    const id = add(other, "บ้านคนอื่น", "08:00");

    expect(listAddresses(db, somchai)).toEqual([]);
    expect(getAddress(db, somchai, id)).toBeNull();
    expect(getAddress(db, other, id)?.address).toBe("บ้านคนอื่น");
  });
});

describe("CHK-002 เพิ่มและแก้ที่อยู่จัดส่ง", () => {
  test("CHK-002 ที่อยู่แห่งแรกเป็นที่อยู่หลักเอง แห่งถัดไปไม่เป็น", () => {
    const account = addAccount(db).id;
    add(account, "แห่งแรก", "14:12");
    add(account, "แห่งที่สอง", "14:13");

    expect(names(account)).toEqual([
      ["แห่งแรก", true],
      ["แห่งที่สอง", false],
    ]);
  });

  test("CHK-002 ตัดช่องว่างหัวท้ายก่อนบันทึก", () => {
    const account = addAccount(db).id;
    createAddress(db, account, { ...somying, recipientName: "  สมหญิง ใจดี  ", postcode: " 50200 " }, at("14:12"));

    expect(listAddresses(db, account)[0]).toMatchObject({ recipientName: "สมหญิง ใจดี", postcode: "50200" });
  });

  test("CHK-002 ข้อมูลไม่ครบหรือผิดรูปแบบ ไม่บันทึกและบอกช่องที่ผิด", () => {
    const account = addAccount(db).id;
    const result = createAddress(db, account, { ...somying, phone: "08123", postcode: "" }, at("14:20"));

    expect(result).toEqual({
      ok: false,
      errors: {
        phone: "เบอร์โทรต้องเป็นตัวเลข 10 หลัก ขึ้นต้นด้วย 0",
        postcode: "กรุณากรอกรหัสไปรษณีย์ 5 หลัก",
      },
    });
    expect(listAddresses(db, account)).toEqual([]);
  });

  test("CHK-002 ตรวจทุกช่องตามตาราง", () => {
    const account = addAccount(db).id;
    const result = createAddress(
      db,
      account,
      {
        recipientName: "",
        phone: "1812345678",
        address: "ก".repeat(201),
        subdistrict: " ",
        district: "ข".repeat(101),
        province: "เมืองลับแล",
        postcode: "5020",
      },
      at("14:20"),
    );

    expect(result).toEqual({
      ok: false,
      errors: {
        recipientName: "กรุณากรอกชื่อผู้รับ",
        phone: "เบอร์โทรต้องเป็นตัวเลข 10 หลัก ขึ้นต้นด้วย 0",
        address: "ที่อยู่ต้องยาวไม่เกิน 200 ตัวอักษร",
        subdistrict: "กรุณากรอกตำบลหรือแขวง",
        district: "อำเภอหรือเขตต้องยาวไม่เกิน 100 ตัวอักษร",
        province: "กรุณาเลือกจังหวัด",
        postcode: "กรุณากรอกรหัสไปรษณีย์ 5 หลัก",
      },
    });
  });

  test("CHK-002 ความยาวนับเป็นตัวอักษร ชื่อผู้รับ 100 ตัวพอดีบันทึกได้", () => {
    const account = addAccount(db).id;
    expect(createAddress(db, account, { ...somying, recipientName: "ก".repeat(100) }, at("14:20")).ok).toBe(true);
    expect(createAddress(db, account, { ...somying, recipientName: "ก".repeat(101) }, at("14:21")).ok).toBe(false);
  });

  test("CHK-002 กดบันทึกซ้ำ 2 ครั้ง ได้ที่อยู่ใหม่ 1 แห่ง และเพิ่มเกิน 10 แห่งไม่ได้", () => {
    const somchai = addAccount(db).id;
    for (let i = 1; i <= 9; i++) add(somchai, `ที่อยู่ ${i}`, `13:${String(i).padStart(2, "0")}`);

    const first = createAddress(db, somchai, { ...somying, address: "แห่งใหม่" }, at("14:25"));
    const second = createAddress(db, somchai, { ...somying, address: "แห่งใหม่" }, at("14:25"));
    expect(first).toEqual(second);
    expect(listAddresses(db, somchai)).toHaveLength(MAX_ADDRESSES);

    const more = createAddress(db, somchai, { ...somying, address: "อีกแห่ง" }, at("14:26"));
    expect(more).toEqual({ ok: false, errors: { form: ADDRESS_LIMIT } });
    expect(ADDRESS_LIMIT).toBe("มีที่อยู่ได้ไม่เกิน 10 แห่ง กรุณาลบที่อยู่ที่ไม่ใช้ก่อน");
    expect(listAddresses(db, somchai)).toHaveLength(MAX_ADDRESSES);
  });

  test("CHK-002 แก้เบอร์โทรแล้วที่อยู่แสดงเบอร์ใหม่ คำสั่งซื้อที่สั่งไว้ก่อนยังเป็นเบอร์เดิม", () => {
    const somchai = addAccount(db).id;
    const work = add(somchai, "ที่ทำงาน", "09:00", { phone: "0891112222" });
    const product = addProduct(db, { price: 150, stock: 5 });
    const saved = getAddress(db, somchai, work)!;
    const order = addOrder(db, {
      buyerAccountId: somchai,
      items: [{ variantId: product.variantIds[0] }],
      orderedAt: at("13:00").toISOString(),
      address: { ...saved, name: saved.recipientName },
    });

    const result = updateAddress(db, somchai, work, { ...somying, address: "ที่ทำงาน", phone: "0893334444" }, at("14:15"));

    expect(result).toEqual({ ok: true, id: work });
    expect(getAddress(db, somchai, work)?.phone).toBe("0893334444");
    expect(db.prepare("SELECT ship_phone FROM orders WHERE id = ?").get(order.id)).toEqual({ ship_phone: "0891112222" });
  });

  test("CHK-002 แก้ไม่ถูกรูปแบบ ไม่บันทึก", () => {
    const account = addAccount(db).id;
    const id = add(account, "บ้าน", "09:00");

    expect(updateAddress(db, account, id, { ...somying, phone: "08123" }, at("14:15")).ok).toBe(false);
    expect(getAddress(db, account, id)?.phone).toBe(somying.phone);
  });

  test("CHK-002 แก้ที่อยู่ที่ลบไปแล้วหรือเป็นของบัญชีอื่นไม่ได้", () => {
    const owner = addAccount(db).id;
    const other = addAccount(db).id;
    const id = add(owner, "บ้าน", "09:00");

    expect(updateAddress(db, other, id, { ...somying, address: "ขโมย" }, at("14:15"))).toEqual({
      ok: false,
      errors: { form: ADDRESS_GONE },
    });
    expect(getAddress(db, owner, id)?.address).toBe("บ้าน");
  });

  test("CHK-002 แก้ที่อยู่ไม่ทำให้ที่อยู่หลักเปลี่ยน", () => {
    const account = addAccount(db).id;
    add(account, "บ้าน", "08:00");
    const work = add(account, "ที่ทำงาน", "09:00");
    updateAddress(db, account, work, { ...somying, address: "ที่ทำงานใหม่" }, at("14:15"));

    expect(names(account)).toEqual([
      ["บ้าน", true],
      ["ที่ทำงานใหม่", false],
    ]);
  });
});

describe("CHK-003 ลบที่อยู่และตั้งที่อยู่หลัก", () => {
  function threeAddresses() {
    const somchai = addAccount(db).id;
    const home = add(somchai, "บ้าน", "08:00");
    const work = add(somchai, "ที่ทำงาน", "09:00");
    const mom = add(somchai, "บ้านแม่", "10:00");
    return { somchai, home, work, mom };
  }

  test("CHK-003 ตั้งที่อยู่หลักแล้วป้ายย้าย ลบที่อยู่หลักแล้วที่เพิ่มล่าสุดในที่เหลือเป็นที่อยู่หลักแทน", () => {
    const { somchai, work } = threeAddresses();

    expect(setDefaultAddress(db, somchai, work, at("14:30"))).toBe(true);
    expect(names(somchai)).toEqual([
      ["ที่ทำงาน", true],
      ["บ้านแม่", false],
      ["บ้าน", false],
    ]);

    expect(deleteAddress(db, somchai, work)).toBe(true);
    expect(names(somchai)).toEqual([
      ["บ้านแม่", true],
      ["บ้าน", false],
    ]);
  });

  test("CHK-003 ลบที่อยู่ที่ไม่ใช่ที่อยู่หลัก ที่อยู่หลักเดิมยังอยู่", () => {
    const { somchai, mom } = threeAddresses();
    deleteAddress(db, somchai, mom);

    expect(names(somchai)).toEqual([
      ["บ้าน", true],
      ["ที่ทำงาน", false],
    ]);
  });

  test("CHK-003 ลบแห่งสุดท้าย เหลือรายการว่าง", () => {
    const account = addAccount(db).id;
    const only = add(account, "บ้าน", "08:00");

    expect(deleteAddress(db, account, only)).toBe(true);
    expect(listAddresses(db, account)).toEqual([]);
  });

  test("CHK-003 ลบที่อยู่ที่เคยใช้สั่งซื้อ คำสั่งซื้อยังแสดงที่อยู่นั้นครบ", () => {
    const { somchai, mom } = threeAddresses();
    const saved = getAddress(db, somchai, mom)!;
    const product = addProduct(db, { price: 150, stock: 5 });
    const order = addOrder(db, {
      buyerAccountId: somchai,
      items: [{ variantId: product.variantIds[0] }],
      orderedAt: at("13:00").toISOString(),
      address: { ...saved, name: saved.recipientName },
    });

    deleteAddress(db, somchai, mom);

    expect(getAddress(db, somchai, mom)).toBeNull();
    expect(db.prepare("SELECT ship_address, ship_postcode FROM orders WHERE id = ?").get(order.id)).toEqual({
      ship_address: "บ้านแม่",
      ship_postcode: "50200",
    });
  });

  test("CHK-003 ตั้งที่อยู่ที่ถูกลบไปแล้วเป็นที่อยู่หลัก ไม่สำเร็จ และที่อยู่หลักยังเป็นแห่งเดิม", () => {
    const { somchai, home, work } = threeAddresses();
    setDefaultAddress(db, somchai, work, at("14:40"));
    deleteAddress(db, somchai, home);

    expect(setDefaultAddress(db, somchai, home, at("14:42"))).toBe(false);
    expect(deleteAddress(db, somchai, home)).toBe(false);
    expect(listAddresses(db, somchai)[0].address).toBe("ที่ทำงาน");
  });

  test("CHK-003 จัดการที่อยู่ของบัญชีอื่นไม่ได้", () => {
    const { somchai, work } = threeAddresses();
    const other = addAccount(db).id;

    expect(setDefaultAddress(db, other, work, at("14:30"))).toBe(false);
    expect(deleteAddress(db, other, work)).toBe(false);
    expect(names(somchai)).toHaveLength(3);
    expect(listAddresses(db, somchai)[0].address).toBe("บ้าน");
  });

  test("CHK-003 ตั้งที่อยู่หลักซ้ำที่เดิม ยังมีที่อยู่หลักแห่งเดียว", () => {
    const { somchai, home } = threeAddresses();

    expect(setDefaultAddress(db, somchai, home, at("14:30"))).toBe(true);
    expect(listAddresses(db, somchai).filter((a) => a.isDefault)).toHaveLength(1);
  });
});

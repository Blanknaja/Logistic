// วัตถุดิบของข้อมูลตัวอย่าง ทุกชื่อเป็นชื่อสมมติ

import type { Address } from "@/shared/db/builders";

export const SHOP_NAME_FIRST = ["บ้านสวน", "ใจดี", "ทองคำ", "ฟ้าใส", "ดาวเหนือ", "ศรีสยาม", "มีสุข", "รุ่งเรือง", "ชัยพร", "สายรุ้ง"];
export const SHOP_NAME_LAST = ["ช็อป", "มาร์ท", "สโตร์", "เฮาส์", "พลาซ่า"];

export const PERSON_FIRST = ["สมชาย", "สมหญิง", "วิชัย", "มานี", "ปิติ", "ชูใจ", "วีระ", "อารีย์", "สุดา", "กมล"];
export const PERSON_LAST = ["ใจดี", "รักไทย", "มั่นคง", "สุขใจ", "ศรีสุข"];

/** ที่อยู่ต้นทางของร้าน ใช้เลขโทรศัพท์ขึ้นต้น 01 ซึ่งไม่ใช่เบอร์ที่ใช้จริงในไทย */
export const LOCATIONS: Omit<Address, "name" | "phone" | "address">[] = [
  { subdistrict: "ลุมพินี", district: "ปทุมวัน", province: "กรุงเทพมหานคร", postcode: "10330" },
  { subdistrict: "ศรีภูมิ", district: "เมืองเชียงใหม่", province: "เชียงใหม่", postcode: "50200" },
  { subdistrict: "ในเมือง", district: "เมืองขอนแก่น", province: "ขอนแก่น", postcode: "40000" },
  { subdistrict: "ตลาดใหญ่", district: "เมืองภูเก็ต", province: "ภูเก็ต", postcode: "83000" },
  { subdistrict: "หาดใหญ่", district: "หาดใหญ่", province: "สงขลา", postcode: "90110" },
  { subdistrict: "บางปลาสร้อย", district: "เมืองชลบุรี", province: "ชลบุรี", postcode: "20000" },
];

/**
 * รูปถ่ายของสินค้าตัวอย่าง ตามคำนามในชื่อสินค้าหรือชื่อเต็มของสินค้าที่มีไฟล์ 3 มิติ ไฟล์อยู่ใน photos/
 * ที่มาและสัญญาอนุญาตอยู่ใน photos/SOURCES.txt ชื่อที่ไม่มีในนี้ใช้รูป SVG
 */
export const SAMPLE_PHOTOS: Partial<Record<string, string[]>> = {
  เสื้อยืด: ["t-shirt.jpg"],
  เสื้อเชิ้ต: ["dress-shirt.jpg"],
  กระโปรง: ["skirt.jpg", "skirt-2.jpg"],
  ชุดเดรส: ["dress.jpg", "dress-2.jpg"],
  กระเป๋าสะพาย: ["shoulder-bag.jpg", "shoulder-bag-2.jpg"],
  กระเป๋าเป้: ["backpack.jpg"],
  รองเท้าผ้าใบ: ["sneakers.jpg"],
  รองเท้าแตะ: ["sandals.jpg"],
  รองเท้าหนัง: ["leather-shoes.jpg"],
  โฟมล้างหน้า: ["face-wash.jpg"],
  ลิปสติก: ["lipstick.jpg"],
  น้ำหอม: ["perfume.jpg", "perfume-2.jpg"],
  สายชาร์จ: ["charging-cable.jpg"],
  เคสมือถือ: ["phone-case.jpg"],
  พาวเวอร์แบงก์: ["power-bank.jpg"],
  ที่ตั้งมือถือ: ["phone-stand.jpg"],
  เมาส์ไร้สาย: ["mouse.jpg"],
  คีย์บอร์ด: ["keyboard.jpg"],
  พัดลมตั้งโต๊ะ: ["desk-fan.jpg"],
  หม้อหุงข้าว: ["rice-cooker.jpg"],
  กาต้มน้ำไฟฟ้า: ["kettle.jpg"],
  หมอนหนุน: ["pillow.jpg"],
  ผ้าปูที่นอน: ["bed-sheet.jpg"],
  กล่องเก็บของ: ["storage-box.jpg"],
  ไม้แขวนเสื้อ: ["hanger.jpg", "hanger-2.jpg"],
  แก้วน้ำ: ["glass.jpg"],
  จานเซรามิก: ["plate.jpg"],
  กาแฟคั่วบด: ["coffee.jpg"],
  ชาเขียว: ["green-tea.jpg", "green-tea-2.jpg"],
  ข้าวหอมมะลิ: ["jasmine-rice.jpg", "jasmine-rice-2.jpg"],
  น้ำพริกเผา: ["chili-paste.jpg"],
  ขนมเปี๊ยะ: ["pia.jpg", "pia-2.jpg"],
  น้ำผึ้งป่า: ["honey.jpg", "honey-2.jpg"],
  ผ้าอ้อม: ["diaper.jpg"],
  ตุ๊กตาผ้า: ["plush-doll.jpg", "plush-doll-2.jpg"],
  ชุดเด็กอ่อน: ["baby-clothes.jpg"],
  ของเล่นไม้: ["wooden-toy.jpg"],
  ลูกฟุตบอล: ["football.jpg"],
  ดัมเบล: ["dumbbell.jpg"],
  ขวดน้ำกีฬา: ["water-bottle.jpg"],
  เต็นท์: ["tent.jpg"],
  นิยายแปล: ["novel.jpg"],
  ดินสอสี: ["colored-pencils.jpg"],
  แฟ้มเอกสาร: ["folder.jpg"],
  อาหารแมว: ["cat-food.jpg"],
  ต้นไม้ในกระถาง: ["potted-plant.jpg", "potted-plant-2.jpg"],
  ร่มพับ: ["umbrella.jpg"],
  เทียนหอม: ["candle.jpg"],
  กรอบรูป: ["picture-frame.jpg"],
  พวงกุญแจ: ["keychain.jpg", "keychain-2.jpg"],
};

export type CategoryCatalog = {
  /** ตรงกับ id ใน migration 0001 */
  categoryId: number;
  nouns: string[];
  details: string[];
  minPrice: number;
  maxPrice: number;
  options: { name: string; values: string[] }[];
};

export const CATEGORIES: CategoryCatalog[] = [
  {
    categoryId: 1,
    nouns: ["เสื้อยืด", "เสื้อเชิ้ต", "กางเกงยีนส์", "กระโปรง", "เสื้อฮู้ด", "ชุดเดรส"],
    details: ["คอกลม", "ผ้าฝ้าย", "ทรงหลวม", "สีพื้น", "ลายทาง"],
    minPrice: 150,
    maxPrice: 1500,
    options: [
      { name: "สี", values: ["ดำ", "ขาว", "กรม"] },
      { name: "ขนาด", values: ["S", "M", "L"] },
    ],
  },
  {
    categoryId: 2,
    nouns: ["กระเป๋าสะพาย", "กระเป๋าเป้", "รองเท้าผ้าใบ", "รองเท้าแตะ", "กระเป๋าสตางค์", "รองเท้าหนัง"],
    details: ["หนังแท้", "น้ำหนักเบา", "กันน้ำ", "ทรงคลาสสิก", "ใส่สบาย"],
    minPrice: 200,
    maxPrice: 3500,
    options: [
      { name: "สี", values: ["ดำ", "น้ำตาล"] },
      { name: "ขนาด", values: ["39", "40", "41", "42"] },
    ],
  },
  {
    categoryId: 3,
    nouns: ["ครีมกันแดด", "โฟมล้างหน้า", "ลิปสติก", "แชมพู", "โลชั่นทาผิว", "น้ำหอม"],
    details: ["สูตรอ่อนโยน", "กลิ่นมะลิ", "ขนาดพกพา", "สำหรับผิวแห้ง", "ออร์แกนิก"],
    minPrice: 59,
    maxPrice: 1200,
    options: [{ name: "ขนาด", values: ["50 มล.", "100 มล."] }],
  },
  {
    categoryId: 4,
    nouns: ["สายชาร์จ", "หูฟังไร้สาย", "เคสมือถือ", "พาวเวอร์แบงก์", "ฟิล์มกันรอย", "ที่ตั้งมือถือ"],
    details: ["ชาร์จเร็ว", "ทนทาน", "รุ่นใหม่", "ขนาดเล็ก", "กันกระแทก"],
    minPrice: 99,
    maxPrice: 2500,
    options: [{ name: "สี", values: ["ดำ", "ขาว", "ฟ้า"] }],
  },
  {
    categoryId: 5,
    nouns: ["เมาส์ไร้สาย", "คีย์บอร์ด", "จอคอมพิวเตอร์", "พัดลมตั้งโต๊ะ", "หม้อหุงข้าว", "กาต้มน้ำไฟฟ้า"],
    details: ["ประหยัดไฟ", "เสียงเงียบ", "รุ่นมาตรฐาน", "ใช้งานง่าย", "ดีไซน์เรียบ"],
    minPrice: 290,
    maxPrice: 15900,
    options: [{ name: "สี", values: ["ดำ", "ขาว"] }],
  },
  {
    categoryId: 6,
    nouns: ["หมอนหนุน", "ผ้าปูที่นอน", "กล่องเก็บของ", "ไม้แขวนเสื้อ", "แก้วน้ำ", "จานเซรามิก"],
    details: ["เนื้อนุ่ม", "ซ้อนได้", "ทนความร้อน", "ลายมินิมอล", "แพ็ก 6 ชิ้น"],
    minPrice: 49,
    maxPrice: 1990,
    options: [{ name: "สี", values: ["ขาว", "เทา", "ครีม"] }],
  },
  {
    categoryId: 7,
    nouns: ["กาแฟคั่วบด", "ชาเขียว", "ข้าวหอมมะลิ", "น้ำพริกเผา", "ขนมเปี๊ยะ", "น้ำผึ้งป่า"],
    details: ["สูตรดั้งเดิม", "จากเชียงใหม่", "ขนาด 500 กรัม", "ไม่ใส่สารกันบูด", "หอมกรุ่น"],
    minPrice: 35,
    maxPrice: 890,
    options: [{ name: "รสชาติ", values: ["ดั้งเดิม", "เผ็ด", "หวานน้อย"] }],
  },
  {
    categoryId: 8,
    nouns: ["ผ้าอ้อม", "ขวดนม", "ตุ๊กตาผ้า", "ชุดเด็กอ่อน", "ผ้าห่มเด็ก", "ของเล่นไม้"],
    details: ["ปลอดภัยสำหรับเด็ก", "ผ้านุ่ม", "ไร้สาร BPA", "สีพาสเทล", "ซักง่าย"],
    minPrice: 89,
    maxPrice: 2200,
    options: [{ name: "ขนาด", values: ["S", "M", "L"] }],
  },
  {
    categoryId: 9,
    nouns: ["ลูกฟุตบอล", "เสื่อโยคะ", "ดัมเบล", "ขวดน้ำกีฬา", "เต็นท์", "รองเท้าวิ่ง"],
    details: ["มาตรฐานแข่งขัน", "น้ำหนักเบา", "กันลื่น", "พกพาสะดวก", "สำหรับมือใหม่"],
    minPrice: 120,
    maxPrice: 4900,
    options: [{ name: "สี", values: ["แดง", "น้ำเงิน", "ดำ"] }],
  },
  {
    categoryId: 10,
    nouns: ["สมุดบันทึก", "ปากกาเจล", "นิยายแปล", "หนังสือสอนทำอาหาร", "ดินสอสี", "แฟ้มเอกสาร"],
    details: ["ปกแข็ง", "ชุด 12 สี", "ฉบับพิมพ์ใหม่", "กระดาษถนอมสายตา", "ขนาด A5"],
    minPrice: 25,
    maxPrice: 690,
    options: [{ name: "สี", values: ["น้ำเงิน", "ดำ", "แดง"] }],
  },
  {
    categoryId: 11,
    nouns: ["อาหารแมว", "อาหารสุนัข", "ทรายแมว", "ปลอกคอ", "ของเล่นแมว", "ที่นอนสัตว์เลี้ยง"],
    details: ["สูตรลูกแมว", "รสปลาทูน่า", "ไร้ฝุ่น", "ปรับขนาดได้", "นุ่มสบาย"],
    minPrice: 59,
    maxPrice: 1500,
    options: [{ name: "ขนาด", values: ["เล็ก", "กลาง", "ใหญ่"] }],
  },
  {
    categoryId: 12,
    nouns: ["ต้นไม้ในกระถาง", "ร่มพับ", "เทียนหอม", "กรอบรูป", "พวงกุญแจ", "สติกเกอร์"],
    details: ["ทำมือ", "ของขวัญ", "ลายไทย", "ขนาดมินิ", "ชุดสุดคุ้ม"],
    minPrice: 19,
    maxPrice: 990,
    options: [{ name: "แบบ", values: ["ลายที่ 1", "ลายที่ 2"] }],
  },
];

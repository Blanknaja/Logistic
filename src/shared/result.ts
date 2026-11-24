/** ผลของงานที่ตรวจข้อมูลที่ผู้ใช้กรอก: สำเร็จพร้อมค่าที่ได้ หรือไม่สำเร็จพร้อมข้อความของแต่ละช่อง */
export type Checked<Value extends object, Errors> = ({ ok: true } & Value) | { ok: false; errors: Errors };

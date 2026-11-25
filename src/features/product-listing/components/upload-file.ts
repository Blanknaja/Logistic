/**
 * ส่งไฟล์ไปที่ path ได้ที่อยู่ของไฟล์กลับมา ไม่สำเร็จได้ข้อความจากเซิร์ฟเวอร์ หรือ failed เมื่อหลุดหรือเกิน timeoutMs
 * fetch บอกความคืบหน้าตอนส่งไม่ได้ จึงใช้ XMLHttpRequest
 */
export function uploadFile(
  path: string,
  file: File,
  timeoutMs: number,
  failed: string,
  onProgress: (percent: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", path);
    const timer = setTimeout(() => request.abort(), timeoutMs);
    request.onloadend = () => clearTimeout(timer);
    request.responseType = "json";
    request.setRequestHeader("Content-Type", file.type);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => {
      const body = request.response as { url?: string; error?: string } | null;
      if (request.status === 200 && body?.url) resolve(body.url);
      else reject(new Error(body?.error ?? failed));
    };
    request.onerror = request.onabort = () => reject(new Error(failed));
    request.send(file);
  });
}

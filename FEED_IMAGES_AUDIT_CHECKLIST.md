# Feed Images Audit Checklist

- ยืนยันว่า `feed-images` ใช้เก็บเฉพาะ public assets สำหรับ feed เท่านั้น
- ยืนยันว่าไม่มีการอัปโหลดสลิป, เอกสารยืนยันตัวตน, หรือไฟล์การเงินลง bucket นี้
- ตรวจทุก flow ที่จะอัปโหลดเข้า `feed-images` ให้ validate MIME type เป็นรูปภาพเท่านั้น
- ทบทวน retention/cleanup policy ของไฟล์ที่ไม่ได้ถูกอ้างอิงแล้ว
- ทบทวนว่า notification หรือ deep link ที่อ้างถึง feed ไม่ชี้ไป route ที่ไม่มีในแอป

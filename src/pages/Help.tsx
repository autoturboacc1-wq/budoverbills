import { motion } from "framer-motion";
import { ArrowLeft, Calculator, BookOpen, HelpCircle, ChevronRight, Percent, Calendar, Users, FileText, CreditCard, Clock, RefreshCw, Shield, MessageCircle, CalendarCheck, Building2, UserCog } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { BottomNav } from "@/components/BottomNav";
import { useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

type HelpCategory = "finance" | "guide" | "faq" | null;

interface HelpArticle {
  id: string;
  icon: React.ReactNode;
  title: string;
  content: React.ReactNode;
}

const financeArticles: HelpArticle[] = [
  {
    id: "interest-types",
    icon: <Percent className="w-5 h-5" />,
    title: "ดอกเบี้ยคงที่ vs ลดต้นลดดอก",
    content: (
      <div className="space-y-5 text-sm text-muted-foreground">
        {/* Flat Rate Section */}
        <div className="border border-border rounded-xl p-4">
          <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-blue-500/20 text-blue-600 flex items-center justify-center text-sm">🔵</span>
            ดอกเบี้ยคงที่ (Flat Rate)
          </h4>
          
          <div className="space-y-3">
            <div className="bg-secondary/50 rounded-lg p-3">
              <p className="font-medium text-foreground mb-1">📌 หลักการ:</p>
              <p>คำนวณดอกเบี้ยจาก<span className="text-primary font-medium">เงินต้นเดิม</span>ตลอดสัญญา ไม่ว่าจะจ่ายไปเท่าไหร่ ดอกเบี้ยก็เท่าเดิม</p>
            </div>

            <div className="bg-muted rounded-lg p-3">
              <p className="font-medium text-foreground mb-2">🧮 ตัวอย่างการคำนวณ:</p>
              <p className="mb-2">ยืม <span className="font-semibold text-foreground">10,000 บาท</span> ดอกเบี้ย <span className="font-semibold text-foreground">5%</span> ต่อเดือน แบ่ง <span className="font-semibold text-foreground">3 งวด</span></p>
              
              <div className="border-t border-border pt-2 mt-2 space-y-1">
                <p>• ดอกเบี้ยรวม = 10,000 × 5% × 3 เดือน = <span className="text-destructive font-semibold">1,500 บาท</span></p>
                <p>• ยอดที่ต้องจ่ายทั้งหมด = 10,000 + 1,500 = <span className="font-semibold">11,500 บาท</span></p>
                <p>• จ่ายงวดละ = 11,500 ÷ 3 = <span className="font-semibold">3,833 บาท</span> (เท่ากันทุกงวด)</p>
              </div>
            </div>

            <div className="flex gap-2">
              <span className="text-lg">✅</span>
              <div>
                <p className="font-medium text-foreground">ข้อดี:</p>
                <p>คำนวณง่าย รู้ยอดชัดเจนตั้งแต่แรก</p>
              </div>
            </div>
            <div className="flex gap-2">
              <span className="text-lg">❌</span>
              <div>
                <p className="font-medium text-foreground">ข้อเสีย:</p>
                <p>จ่ายดอกเบี้ยมากกว่า เพราะคิดจากเงินต้นเต็มตลอด</p>
              </div>
            </div>
          </div>
        </div>

        {/* Reducing Balance Section */}
        <div className="border border-status-paid/50 rounded-xl p-4 bg-status-paid/5">
          <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-green-500/20 text-green-600 flex items-center justify-center text-sm">🟢</span>
            ลดต้นลดดอก (Reducing Balance)
          </h4>
          
          <div className="space-y-3">
            <div className="bg-secondary/50 rounded-lg p-3">
              <p className="font-medium text-foreground mb-1">📌 หลักการ:</p>
              <p>คำนวณดอกเบี้ยจาก<span className="text-status-paid font-medium">เงินต้นที่เหลืออยู่</span> ยิ่งจ่ายไปเยอะ ดอกเบี้ยก็ยิ่งน้อยลง!</p>
            </div>

            <div className="bg-muted rounded-lg p-3">
              <p className="font-medium text-foreground mb-2">🧮 ตัวอย่างการคำนวณ:</p>
              <p className="mb-2">ยืม <span className="font-semibold text-foreground">10,000 บาท</span> ดอกเบี้ย <span className="font-semibold text-foreground">5%</span> ต่อเดือน แบ่ง <span className="font-semibold text-foreground">3 งวด</span></p>
              <p className="text-xs text-muted-foreground mb-2">(เงินต้นต่องวด = 10,000 ÷ 3 = 3,333 บาท)</p>
              
              <div className="border-t border-border pt-2 mt-2 space-y-2">
                <div className="flex justify-between items-center">
                  <span>งวด 1:</span>
                  <span>เงินต้นคงเหลือ 10,000 × 5% = ดอกเบี้ย <span className="font-semibold">500 บาท</span></span>
                </div>
                <div className="flex justify-between items-center">
                  <span>งวด 2:</span>
                  <span>เงินต้นคงเหลือ 6,667 × 5% = ดอกเบี้ย <span className="font-semibold">333 บาท</span></span>
                </div>
                <div className="flex justify-between items-center">
                  <span>งวด 3:</span>
                  <span>เงินต้นคงเหลือ 3,333 × 5% = ดอกเบี้ย <span className="font-semibold">167 บาท</span></span>
                </div>
                <div className="border-t border-border pt-2 mt-1">
                  <p>• ดอกเบี้ยรวม = 500 + 333 + 167 = <span className="text-status-paid font-semibold">1,000 บาท</span></p>
                  <p className="text-status-paid font-medium mt-1">💰 ประหยัดไป 500 บาท เทียบกับดอกเบี้ยคงที่!</p>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <span className="text-lg">✅</span>
              <div>
                <p className="font-medium text-foreground">ข้อดี:</p>
                <p>จ่ายดอกเบี้ยน้อยกว่า ยิ่งจ่ายเร็วยิ่งประหยัด</p>
              </div>
            </div>
            <div className="flex gap-2">
              <span className="text-lg">❌</span>
              <div>
                <p className="font-medium text-foreground">ข้อเสีย:</p>
                <p>ยอดชำระแต่ละงวดไม่เท่ากัน (งวดแรกสูงกว่า)</p>
              </div>
            </div>
          </div>
        </div>

        {/* Comparison Table */}
        <div className="bg-muted rounded-xl p-4">
          <h4 className="font-semibold text-foreground mb-3 text-center">📊 เปรียบเทียบ (ยืม 10,000 บาท 5%/เดือน 3 งวด)</h4>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="bg-blue-500/10 rounded-lg p-3">
              <p className="text-sm text-muted-foreground">ดอกเบี้ยคงที่</p>
              <p className="text-xl font-bold text-foreground">1,500 บาท</p>
            </div>
            <div className="bg-green-500/10 rounded-lg p-3">
              <p className="text-sm text-muted-foreground">ลดต้นลดดอก</p>
              <p className="text-xl font-bold text-status-paid">1,000 บาท</p>
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="bg-primary/10 rounded-lg p-4 border border-primary/20">
          <p className="text-primary font-semibold mb-2">💡 สรุปง่ายๆ:</p>
          <ul className="space-y-1">
            <li>• <span className="font-medium">ลดต้นลดดอก</span> = ประหยัดกว่า แต่ยอดแต่ละงวดไม่เท่ากัน</li>
            <li>• <span className="font-medium">ดอกเบี้ยคงที่</span> = คำนวณง่าย จ่ายเท่าๆ กันทุกงวด</li>
          </ul>
        </div>
      </div>
    ),
  },
  {
    id: "borrower-tips",
    icon: <BookOpen className="w-5 h-5" />,
    title: "เคล็ดลับสำหรับผู้ยืม",
    content: (
      <div className="space-y-4 text-sm text-muted-foreground">
        <p className="text-foreground font-medium">วิธีจัดการหนี้อย่างชาญฉลาด:</p>

        {/* Tip 1 */}
        <div className="border-l-4 border-primary pl-4 space-y-1">
          <p className="font-semibold text-foreground">1. เลือกลดต้นลดดอกถ้าทำได้</p>
          <p>ถ้าผู้ให้ยืมยินยอม เลือก "ลดต้นลดดอก" จะประหยัดดอกเบี้ยมากกว่า</p>
        </div>

        {/* Tip 2 */}
        <div className="border-l-4 border-status-paid pl-4 space-y-1">
          <p className="font-semibold text-foreground">2. จ่ายก่อนกำหนดถ้ามีเงินเหลือ</p>
          <p>ถ้าเป็นแบบลดต้นลดดอก การจ่ายเพิ่มจะช่วยลดดอกเบี้ยงวดถัดไป</p>
          <div className="bg-secondary/50 rounded p-2 mt-1">
            <p className="text-xs">💡 ใช้ปุ่ม "จ่ายเพิ่ม" ในหน้ารายละเอียดข้อตกลง</p>
          </div>
        </div>

        {/* Tip 3 */}
        <div className="border-l-4 border-amber-500 pl-4 space-y-1">
          <p className="font-semibold text-foreground">3. อย่ารอจนเลยกำหนด</p>
          <p>ถ้าจ่ายไม่ทัน ขอเลื่อนนัด<span className="font-medium">ก่อน</span>ถึงวันครบกำหนด ค่าธรรมเนียมจะถูกกว่า</p>
        </div>

        {/* Tip 4 */}
        <div className="border-l-4 border-blue-500 pl-4 space-y-1">
          <p className="font-semibold text-foreground">4. ตั้งเตือนล่วงหน้า</p>
          <p>เปิดการแจ้งเตือนในแอป จะได้ไม่พลาดวันชำระ</p>
        </div>

        {/* Tip 5 */}
        <div className="border-l-4 border-purple-500 pl-4 space-y-1">
          <p className="font-semibold text-foreground">5. คำนวณก่อนยืม</p>
          <p>ดูยอดรวมที่ต้องจ่ายก่อนตกลง ถามตัวเองว่าไหวไหม</p>
          <div className="bg-secondary/50 rounded p-2 mt-1">
            <p className="text-xs">📐 สูตร: ถ้ายอดต่องวด &gt; 30% ของรายได้ = ควรพิจารณาใหม่</p>
          </div>
        </div>

        <div className="bg-status-paid/10 rounded-lg p-4 border border-status-paid/20 mt-4">
          <p className="text-status-paid font-semibold mb-2">✨ สรุปปฏิบัติ:</p>
          <ol className="space-y-1 list-decimal list-inside">
            <li>เลือกลดต้นลดดอกถ้าได้</li>
            <li>จ่ายตรงเวลาหรือก่อนเวลา</li>
            <li>มีปัญหา รีบขอเลื่อนนัด</li>
            <li>เปิดแจ้งเตือนทุกข้อตกลง</li>
          </ol>
        </div>
      </div>
    ),
  },
  {
    id: "installment-calculation",
    icon: <Calculator className="w-5 h-5" />,
    title: "การคำนวณงวดชำระ",
    content: (
      <div className="space-y-4 text-sm text-muted-foreground">
        <p>BOB ช่วยคำนวณงวดให้อัตโนมัติตามประเภทดอกเบี้ยที่เลือก</p>
        
        <div>
          <h4 className="font-medium text-foreground mb-2">📐 สูตรคำนวณดอกเบี้ยคงที่</h4>
          <div className="bg-secondary/50 rounded-lg p-3">
            <p>ยอดต่องวด = (เงินต้น + ดอกเบี้ยรวม) ÷ จำนวนงวด</p>
          </div>
        </div>

        <div>
          <h4 className="font-medium text-foreground mb-2">📊 สูตรคำนวณลดต้นลดดอก</h4>
          <div className="bg-secondary/50 rounded-lg p-3">
            <p>เงินต้นต่องวด = เงินต้น ÷ จำนวนงวด</p>
            <p>ดอกเบี้ยต่องวด = เงินต้นคงเหลือ × อัตราดอกเบี้ย</p>
          </div>
        </div>

        <div className="bg-amber-500/10 rounded-lg p-3 border border-amber-500/20">
          <p className="text-amber-600 font-medium">⚠️ สำคัญ:</p>
          <p>ผลรวมของทุกงวดต้องเท่ากับยอดรวมพอดี</p>
        </div>
      </div>
    ),
  },
  {
    id: "reschedule-fee",
    icon: <Clock className="w-5 h-5" />,
    title: "ค่าธรรมเนียมเลื่อนนัด",
    content: (
      <div className="space-y-4 text-sm text-muted-foreground">
        <p>หากต้องการเลื่อนวันชำระ จะมีค่าธรรมเนียมตามที่ตกลงในข้อตกลง</p>
        
        <div>
          <h4 className="font-medium text-foreground mb-2">💰 การคำนวณค่าเลื่อนนัด</h4>
          <div className="bg-secondary/50 rounded-lg p-3">
            <p>ค่าเลื่อนนัด = ยอดงวด × อัตราค่าเลื่อนนัด</p>
            <p className="mt-2">ตัวอย่าง: งวด 3,000 บาท × 3% = 90 บาท</p>
          </div>
        </div>

        <div>
          <h4 className="font-medium text-foreground mb-2">📅 การแบ่งจ่ายค่าเลื่อนนัด</h4>
          <p>สามารถเลือกแบ่งจ่ายค่าเลื่อนนัดเป็นงวดๆ ได้ (1-6 งวด)</p>
        </div>

        <div className="bg-primary/10 rounded-lg p-3 border border-primary/20">
          <p className="text-primary font-medium">💡 เคล็ดลับ:</p>
          <p>ขอเลื่อนนัดล่วงหน้าก่อนถึงวันครบกำหนดจะดีที่สุด</p>
        </div>
      </div>
    ),
  },
];

const guideArticles: HelpArticle[] = [
  {
    id: "create-agreement",
    icon: <FileText className="w-5 h-5" />,
    title: "วิธีสร้างข้อตกลง",
    content: (
      <div className="space-y-4 text-sm text-muted-foreground">
        <p>ผู้ยืมเป็นคนสร้างข้อตกลง ผู้ให้ยืมเป็นคนยืนยัน</p>
        
        <div className="space-y-3">
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">1</span>
            <p>กดปุ่ม "สร้างข้อตกลง" ที่แถบด้านล่าง</p>
          </div>
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">2</span>
            <p>เลือกเพื่อนที่เป็นผู้ให้ยืม (ต้องเพิ่มเพื่อนก่อน)</p>
          </div>
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">3</span>
            <p>กรอกจำนวนเงิน ดอกเบี้ย และจำนวนงวด</p>
          </div>
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">4</span>
            <p>ตรวจสอบและกดสร้างข้อตกลง</p>
          </div>
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">5</span>
            <p>รอผู้ให้ยืมอัพสลิปและยืนยัน</p>
          </div>
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">6</span>
            <p>ผู้ยืมยืนยันรับเงิน → ข้อตกลงเริ่มต้น</p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "confirm-payment",
    icon: <CreditCard className="w-5 h-5" />,
    title: "วิธียืนยันการชำระ",
    content: (
      <div className="space-y-4 text-sm text-muted-foreground">
        <div>
          <h4 className="font-medium text-foreground mb-2">👤 สำหรับผู้ยืม</h4>
          <ol className="space-y-2 list-decimal list-inside">
            <li>โอนเงินตามยอดและบัญชีที่ระบุ</li>
            <li>กดที่งวดที่ต้องการชำระในปฏิทิน</li>
            <li>อัพโหลดสลิปการโอน</li>
            <li>รอผู้ให้ยืมยืนยัน</li>
          </ol>
        </div>

        <div>
          <h4 className="font-medium text-foreground mb-2">🏦 สำหรับผู้ให้ยืม</h4>
          <ol className="space-y-2 list-decimal list-inside">
            <li>เมื่อได้รับแจ้งเตือน ให้กดดูสลิป</li>
            <li>ตรวจสอบยอดและวันที่โอน</li>
            <li>กด "ยืนยันรับเงิน" หากถูกต้อง</li>
          </ol>
        </div>
      </div>
    ),
  },
  {
    id: "add-friend",
    icon: <Users className="w-5 h-5" />,
    title: "วิธีเพิ่มเพื่อน",
    content: (
      <div className="space-y-4 text-sm text-muted-foreground">
        <p>ต้องเพิ่มเพื่อนก่อนจึงจะสร้างข้อตกลงได้</p>
        
        <div className="space-y-3">
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">1</span>
            <p>ไปที่โปรไฟล์ → เพื่อน</p>
          </div>
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">2</span>
            <p>กรอกรหัสผู้ใช้ของเพื่อน (6 ตัวอักษร)</p>
          </div>
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">3</span>
            <p>กดส่งคำขอเป็นเพื่อน</p>
          </div>
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">4</span>
            <p>รอเพื่อนยอมรับคำขอ</p>
          </div>
        </div>

        <div className="bg-primary/10 rounded-lg p-3 border border-primary/20">
          <p className="text-primary font-medium">💡 เคล็ดลับ:</p>
          <p>ดูรหัสผู้ใช้ของตัวเองได้ที่หน้าโปรไฟล์</p>
        </div>
      </div>
    ),
  },
  {
    id: "reschedule-request",
    icon: <RefreshCw className="w-5 h-5" />,
    title: "วิธีขอเลื่อนนัด",
    content: (
      <div className="space-y-4 text-sm text-muted-foreground">
        <p>หากไม่สามารถชำระตามกำหนดได้ สามารถขอเลื่อนนัดได้</p>
        
        <div className="space-y-3">
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">1</span>
            <p>กดที่งวดที่ต้องการเลื่อนในปฏิทิน</p>
          </div>
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">2</span>
            <p>เลือก "ขอเลื่อนนัด"</p>
          </div>
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">3</span>
            <p>เลือกวันที่ใหม่ที่ต้องการ</p>
          </div>
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">4</span>
            <p>ชำระค่าธรรมเนียมเลื่อนนัด (ถ้ามี)</p>
          </div>
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">5</span>
            <p>รอผู้ให้ยืมอนุมัติ</p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "calendar-usage",
    icon: <CalendarCheck className="w-5 h-5" />,
    title: "วิธีดูปฏิทินชำระ",
    content: (
      <div className="space-y-4 text-sm text-muted-foreground">
        <p>ปฏิทินแสดงงวดที่ต้องชำระในเดือนนี้ แยกตามความถี่</p>
        
        <div>
          <h4 className="font-medium text-foreground mb-2">📅 หน้าปฏิทิน</h4>
          <ul className="space-y-2">
            <li>• <span className="text-status-paid font-medium">สีเขียว</span> = ชำระครบแล้ว</li>
            <li>• <span className="text-status-pending font-medium">สีเหลือง</span> = รอยืนยัน</li>
            <li>• <span className="text-status-overdue font-medium">สีส้ม</span> = เลยกำหนด</li>
          </ul>
        </div>

        <div>
          <h4 className="font-medium text-foreground mb-2">🖱️ การใช้งาน</h4>
          <ol className="space-y-2 list-decimal list-inside">
            <li>กดที่การ์ดความถี่ (รายวัน/รายสัปดาห์/รายเดือน)</li>
            <li>ดูงวดทั้งหมดในเดือนนั้น</li>
            <li>กดที่งวดเพื่อชำระหรือขอเลื่อนนัด</li>
          </ol>
        </div>

        <div className="bg-primary/10 rounded-lg p-3 border border-primary/20">
          <p className="text-primary font-medium">💡 เคล็ดลับ:</p>
          <p>กดดูรายละเอียดข้อตกลงได้จากหน้าปฏิทิน</p>
        </div>
      </div>
    ),
  },
  {
    id: "bank-account-setup",
    icon: <Building2 className="w-5 h-5" />,
    title: "วิธีตั้งค่าบัญชีธนาคาร",
    content: (
      <div className="space-y-4 text-sm text-muted-foreground">
        <p>ผู้ให้ยืมต้องตั้งค่าบัญชีธนาคารเพื่อรับเงินชำระ</p>
        
        <div className="space-y-3">
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">1</span>
            <p>ไปที่หน้าโปรไฟล์</p>
          </div>
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">2</span>
            <p>กดที่การ์ด "บัญชีธนาคาร"</p>
          </div>
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">3</span>
            <p>เลือกธนาคาร กรอกเลขบัญชี และชื่อบัญชี</p>
          </div>
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">4</span>
            <p>กดบันทึก</p>
          </div>
        </div>

        <div className="bg-amber-500/10 rounded-lg p-3 border border-amber-500/20">
          <p className="text-amber-600 font-medium">⚠️ สำคัญ:</p>
          <p>ต้องตั้งค่าบัญชีก่อนจึงจะยืนยันข้อตกลงในฐานะผู้ให้ยืมได้</p>
        </div>
      </div>
    ),
  },
  {
    id: "edit-profile",
    icon: <UserCog className="w-5 h-5" />,
    title: "วิธีแก้ไขโปรไฟล์",
    content: (
      <div className="space-y-4 text-sm text-muted-foreground">
        <p>คุณสามารถเปลี่ยนชื่อและรูปโปรไฟล์ได้ตลอดเวลา</p>
        
        <div className="space-y-3">
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">1</span>
            <p>ไปที่หน้าโปรไฟล์</p>
          </div>
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">2</span>
            <p>กดที่รูปโปรไฟล์หรือชื่อ</p>
          </div>
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">3</span>
            <p>อัพโหลดรูปใหม่หรือแก้ไขชื่อ</p>
          </div>
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">4</span>
            <p>กดบันทึกการเปลี่ยนแปลง</p>
          </div>
        </div>

        <div className="bg-primary/10 rounded-lg p-3 border border-primary/20">
          <p className="text-primary font-medium">💡 หมายเหตุ:</p>
          <p>รหัสผู้ใช้ 6 หลักไม่สามารถเปลี่ยนได้ ใช้สำหรับให้เพื่อนเพิ่มคุณ</p>
        </div>
      </div>
    ),
  },
];

const faqArticles: HelpArticle[] = [
  {
    id: "forgot-password",
    icon: <Shield className="w-5 h-5" />,
    title: "ลืมรหัสผ่าน ทำอย่างไร?",
    content: (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>ที่หน้าเข้าสู่ระบบ กดที่ "ลืมรหัสผ่าน" แล้วกรอกอีเมลที่ใช้สมัคร ระบบจะส่งลิงก์รีเซ็ตรหัสผ่านไปที่อีเมลของคุณ</p>
      </div>
    ),
  },
  {
    id: "edit-agreement",
    icon: <FileText className="w-5 h-5" />,
    title: "แก้ไขข้อตกลงได้ไหม?",
    content: (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>ข้อตกลงที่ได้รับการยืนยันแล้วไม่สามารถแก้ไขได้ เพื่อความโปร่งใสและป้องกันการเปลี่ยนแปลงย้อนหลัง</p>
        <p>หากต้องการเปลี่ยนแปลง ให้ยกเลิกข้อตกลงเดิมและสร้างใหม่ (ต้องได้รับความยินยอมจากทั้งสองฝ่าย)</p>
      </div>
    ),
  },
  {
    id: "contact-support",
    icon: <MessageCircle className="w-5 h-5" />,
    title: "ติดต่อทีมงานอย่างไร?",
    content: (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>คุณสามารถติดต่อเราได้ที่:</p>
        <ul className="space-y-2">
          <li>• อีเมล: support@budoverbills.com</li>
          <li>• หรือกดที่ "เลี้ยงกาแฟทีมงาน" เพื่อสนับสนุนเรา</li>
        </ul>
      </div>
    ),
  },
  {
    id: "data-security",
    icon: <Shield className="w-5 h-5" />,
    title: "ข้อมูลปลอดภัยไหม?",
    content: (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>BOB ใช้มาตรฐานความปลอดภัยระดับธนาคาร:</p>
        <ul className="space-y-2">
          <li>• การเข้ารหัสข้อมูลแบบ End-to-end</li>
          <li>• ไม่เก็บรหัสผ่านเป็น plain text</li>
          <li>• มีระบบยืนยันตัวตนสองชั้น</li>
          <li>• ปฏิบัติตาม PDPA</li>
        </ul>
      </div>
    ),
  },
  {
    id: "subscription-benefits",
    icon: <CreditCard className="w-5 h-5" />,
    title: "สมัครสมาชิกได้อะไรบ้าง?",
    content: (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>ผู้ใช้ฟรีสามารถสร้างข้อตกลงได้ 2 รายการ หลังจากนั้นสามารถ:</p>
        <ul className="space-y-2">
          <li>• ซื้อเครดิตสร้างข้อตกลงเพิ่ม (29 บาท/รายการ)</li>
          <li>• หรือสมัครสมาชิกรายเดือน เพื่อสร้างไม่จำกัด</li>
        </ul>
      </div>
    ),
  },
];

const categoryInfo = {
  finance: {
    icon: <Calculator className="w-6 h-6" />,
    title: "ความรู้การเงิน",
    description: "เรียนรู้เกี่ยวกับดอกเบี้ยและการคำนวณ",
    color: "from-blue-500/20 to-blue-500/5 border-blue-500/20",
    articles: financeArticles,
  },
  guide: {
    icon: <BookOpen className="w-6 h-6" />,
    title: "คู่มือใช้งาน",
    description: "วิธีใช้งานฟีเจอร์ต่างๆ",
    color: "from-green-500/20 to-green-500/5 border-green-500/20",
    articles: guideArticles,
  },
  faq: {
    icon: <HelpCircle className="w-6 h-6" />,
    title: "คำถามที่พบบ่อย",
    description: "คำตอบสำหรับคำถามทั่วไป",
    color: "from-amber-500/20 to-amber-500/5 border-amber-500/20",
    articles: faqArticles,
  },
};

export default function Help() {
  const navigate = useNavigate();
  const [selectedCategory, setSelectedCategory] = useState<HelpCategory>(null);

  const handleBack = () => {
    if (selectedCategory) {
      setSelectedCategory(null);
    } else if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/profile");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-hero pb-24">
      <div className="max-w-lg mx-auto px-4">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-4 py-4"
        >
          <button
            onClick={handleBack}
            className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-secondary-foreground" />
          </button>
          <div>
            <h1 className="text-xl font-heading font-semibold text-foreground">
              {selectedCategory ? categoryInfo[selectedCategory].title : "ช่วยเหลือ"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {selectedCategory ? categoryInfo[selectedCategory].description : "ความรู้และคู่มือการใช้งาน"}
            </p>
          </div>
        </motion.header>

        {/* Category Cards */}
        {!selectedCategory && (
          <div className="space-y-4">
            {(Object.keys(categoryInfo) as HelpCategory[]).filter(Boolean).map((key, index) => {
              const category = categoryInfo[key!];
              return (
                <motion.button
                  key={key}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  onClick={() => setSelectedCategory(key)}
                  className={`w-full bg-gradient-to-br ${category.color} rounded-2xl p-5 border text-left hover:scale-[1.02] transition-transform`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-card flex items-center justify-center">
                        {category.icon}
                      </div>
                      <div>
                        <p className="font-heading font-semibold text-foreground">
                          {category.title}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {category.description}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {category.articles.length} บทความ
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}

        {/* Article List */}
        {selectedCategory && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <Accordion type="single" collapsible className="space-y-3">
              {categoryInfo[selectedCategory].articles.map((article, index) => (
                <motion.div
                  key={article.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <AccordionItem
                    value={article.id}
                    className="bg-card rounded-2xl shadow-card border-none overflow-hidden"
                  >
                    <AccordionTrigger className="px-4 py-4 hover:no-underline hover:bg-secondary/50">
                      <div className="flex items-center gap-3 text-left">
                        <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                          {article.icon}
                        </div>
                        <span className="font-medium text-foreground">
                          {article.title}
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4">
                      {article.content}
                    </AccordionContent>
                  </AccordionItem>
                </motion.div>
              ))}
            </Accordion>
          </motion.div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}

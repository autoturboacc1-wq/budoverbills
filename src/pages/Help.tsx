import { motion } from "framer-motion";
import { PageTransition } from "@/components/ux/PageTransition";
import {
  ArrowLeft,
  BookOpen,
  Building2,
  Calculator,
  CalendarCheck,
  ChevronRight,
  Clock,
  CreditCard,
  FileText,
  HelpCircle,
  MessageCircle,
  Percent,
  RefreshCw,
  Shield,
  UserCog,
  Users,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

type HelpCategory = "finance" | "guide" | "faq" | null;

interface HelpArticle {
  id: string;
  icon: ReactNode;
  title: string;
  content: ReactNode;
}

const HELP_COPY = {
  th: {
    title: "ช่วยเหลือ",
    subtitle: "ความรู้และคู่มือการใช้งาน",
    articleCount: "บทความ",
    categories: {
      finance: { title: "ความรู้การเงิน", description: "เรียนรู้เกี่ยวกับดอกเบี้ยและการคำนวณ" },
      guide: { title: "คู่มือใช้งาน", description: "วิธีใช้งานฟีเจอร์ต่างๆ" },
      faq: { title: "คำถามที่พบบ่อย", description: "คำตอบสำหรับคำถามทั่วไป" },
    },
    articleTitles: {
      "interest-types": "ดอกเบี้ยคงที่ vs ลดต้นลดดอก",
      "borrower-tips": "เคล็ดลับสำหรับผู้ยืม",
      "installment-calculation": "การคำนวณงวดชำระ",
      "reschedule-fee": "ค่าธรรมเนียมเลื่อนนัด",
      "create-agreement": "วิธีสร้างข้อตกลง",
      "confirm-payment": "วิธียืนยันการชำระ",
      "add-friend": "วิธีเพิ่มเพื่อน",
      "reschedule-request": "วิธีขอเลื่อนนัด",
      "calendar-usage": "วิธีดูปฏิทินชำระ",
      "bank-account-setup": "วิธีตั้งค่าบัญชีธนาคาร",
      "edit-profile": "วิธีแก้ไขโปรไฟล์",
      "forgot-password": "ลืมรหัสผ่าน ทำอย่างไร?",
      "edit-agreement": "แก้ไขข้อตกลงได้ไหม?",
      "contact-support": "ติดต่อทีมงานอย่างไร?",
      "data-security": "ข้อมูลปลอดภัยไหม?",
      "subscription-benefits": "สมัครสมาชิกได้อะไรบ้าง?",
    },
  },
  en: {
    title: "Help",
    subtitle: "Guides and support",
    articleCount: "articles",
    categories: {
      finance: { title: "Finance", description: "Learn about interest and calculations" },
      guide: { title: "How To", description: "How to use the app features" },
      faq: { title: "FAQ", description: "Answers to common questions" },
    },
    articleTitles: {
      "interest-types": "Fixed rate vs reducing balance",
      "borrower-tips": "Tips for borrowers",
      "installment-calculation": "Installment calculations",
      "reschedule-fee": "Reschedule fees",
      "create-agreement": "How to create an agreement",
      "confirm-payment": "How to confirm payment",
      "add-friend": "How to add a friend",
      "reschedule-request": "How to request a reschedule",
      "calendar-usage": "How to use the payment calendar",
      "bank-account-setup": "How to set up a bank account",
      "edit-profile": "How to edit your profile",
      "forgot-password": "Forgot your password?",
      "edit-agreement": "Can I edit an agreement?",
      "contact-support": "How do I contact the team?",
      "data-security": "Is my data safe?",
      "subscription-benefits": "What do I get with a subscription?",
    },
  },
} as const;

type HelpCopy = (typeof HELP_COPY)[keyof typeof HELP_COPY];

const buildFinanceArticles = (isThai: boolean): HelpArticle[] => [
  {
    id: "interest-types",
    icon: <Percent className="w-5 h-5" />,
    title: isThai ? "ดอกเบี้ยคงที่ vs ลดต้นลดดอก" : "Fixed rate vs reducing balance",
    content: (
      <div className="space-y-5 text-sm text-muted-foreground">
        <div className="border border-border rounded-xl p-4">
          <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-blue-500/20 text-blue-600 flex items-center justify-center text-sm">🔵</span>
            {isThai ? "ดอกเบี้ยคงที่ (Flat Rate)" : "Fixed rate (Flat Rate)"}
          </h4>

          <div className="space-y-3">
            <div className="bg-secondary/50 rounded-lg p-3">
              <p className="font-medium text-foreground mb-1">{isThai ? "📌 หลักการ:" : "📌 Principle:"}</p>
              <p>
                {isThai ? (
                  <>
                    คำนวณดอกเบี้ยจาก<span className="text-primary font-medium">เงินต้นเดิม</span>ตลอดสัญญา
                    ไม่ว่าจะจ่ายไปเท่าไหร่ ดอกเบี้ยก็เท่าเดิม
                  </>
                ) : (
                  <>
                    Interest is calculated from the <span className="text-primary font-medium">original principal</span> for the entire agreement.
                    No matter how much you pay, the interest stays the same.
                  </>
                )}
              </p>
            </div>

            <div className="bg-muted rounded-lg p-3">
              <p className="font-medium text-foreground mb-2">
                {isThai ? "🧮 ตัวอย่างการคำนวณ:" : "🧮 Calculation example:"}
              </p>
              <p className="mb-2">
                {isThai ? (
                  <>
                    ยืม <span className="font-semibold text-foreground">10,000 บาท</span> ดอกเบี้ย{" "}
                    <span className="font-semibold text-foreground">5%</span> ต่อเดือน แบ่ง{" "}
                    <span className="font-semibold text-foreground">3 งวด</span>
                  </>
                ) : (
                  <>
                    Borrow <span className="font-semibold text-foreground">10,000 baht</span> at{" "}
                    <span className="font-semibold text-foreground">5%</span> per month over{" "}
                    <span className="font-semibold text-foreground">3 installments</span>
                  </>
                )}
              </p>

              <div className="border-t border-border pt-2 mt-2 space-y-1">
                <p>
                  {isThai ? (
                    <>
                      • ดอกเบี้ยรวม = 10,000 × 5% × 3 เดือน ={" "}
                      <span className="text-destructive font-semibold">1,500 บาท</span>
                    </>
                  ) : (
                    <>
                      • Total interest = 10,000 × 5% × 3 months ={" "}
                      <span className="text-destructive font-semibold">1,500 baht</span>
                    </>
                  )}
                </p>
                <p>
                  {isThai ? (
                    <>
                      • ยอดที่ต้องจ่ายทั้งหมด = 10,000 + 1,500 = <span className="font-semibold">11,500 บาท</span>
                    </>
                  ) : (
                    <>
                      • Total amount due = 10,000 + 1,500 = <span className="font-semibold">11,500 baht</span>
                    </>
                  )}
                </p>
                <p>
                  {isThai ? (
                    <>
                      • จ่ายงวดละ = 11,500 ÷ 3 = <span className="font-semibold">3,833 บาท</span> (เท่ากันทุกงวด)
                    </>
                  ) : (
                    <>
                      • Per installment = 11,500 ÷ 3 = <span className="font-semibold">3,833 baht</span> (same every time)
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <span className="text-lg">✅</span>
              <div>
                <p className="font-medium text-foreground">{isThai ? "ข้อดี:" : "Pros:"}</p>
                <p>{isThai ? "คำนวณง่าย รู้ยอดชัดเจนตั้งแต่แรก" : "Easy to calculate and the total is clear from the start."}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <span className="text-lg">❌</span>
              <div>
                <p className="font-medium text-foreground">{isThai ? "ข้อเสีย:" : "Cons:"}</p>
                <p>{isThai ? "จ่ายดอกเบี้ยมากกว่า เพราะคิดจากเงินต้นเต็มตลอด" : "You pay more interest because it is based on the full principal the whole time."}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="border border-status-paid/50 rounded-xl p-4 bg-status-paid/5">
          <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-green-500/20 text-green-600 flex items-center justify-center text-sm">🟢</span>
            {isThai ? "ลดต้นลดดอก (Reducing Balance)" : "Reducing balance"}
          </h4>

          <div className="space-y-3">
            <div className="bg-secondary/50 rounded-lg p-3">
              <p className="font-medium text-foreground mb-1">{isThai ? "📌 หลักการ:" : "📌 Principle:"}</p>
              <p>
                {isThai ? (
                  <>
                    คำนวณดอกเบี้ยจาก<span className="text-status-paid font-medium">เงินต้นที่เหลืออยู่</span> ยิ่งจ่ายไปเยอะ ดอกเบี้ยก็ยิ่งน้อยลง!
                  </>
                ) : (
                  <>
                    Interest is calculated from the <span className="text-status-paid font-medium">remaining principal</span>. The more you repay, the lower the interest gets.
                  </>
                )}
              </p>
            </div>

            <div className="bg-muted rounded-lg p-3">
              <p className="font-medium text-foreground mb-2">
                {isThai ? "🧮 ตัวอย่างการคำนวณ:" : "🧮 Calculation example:"}
              </p>
              <p className="mb-2">
                {isThai ? (
                  <>
                    ยืม <span className="font-semibold text-foreground">10,000 บาท</span> ดอกเบี้ย{" "}
                    <span className="font-semibold text-foreground">5%</span> ต่อเดือน แบ่ง{" "}
                    <span className="font-semibold text-foreground">3 งวด</span>
                  </>
                ) : (
                  <>
                    Borrow <span className="font-semibold text-foreground">10,000 baht</span> at{" "}
                    <span className="font-semibold text-foreground">5%</span> per month over{" "}
                    <span className="font-semibold text-foreground">3 installments</span>
                  </>
                )}
              </p>
              <p className="text-xs text-muted-foreground mb-2">
                {isThai ? "(เงินต้นต่องวด = 10,000 ÷ 3 = 3,333 บาท)" : "(Principal per installment = 10,000 ÷ 3 = 3,333 baht)"}
              </p>

              <div className="border-t border-border pt-2 mt-2 space-y-2">
                <div className="flex justify-between items-center gap-3">
                  <span>{isThai ? "งวด 1:" : "Installment 1:"}</span>
                  <span>
                    {isThai ? (
                      <>
                        เงินต้นคงเหลือ 10,000 × 5% = ดอกเบี้ย <span className="font-semibold">500 บาท</span>
                      </>
                    ) : (
                      <>
                        Remaining principal 10,000 × 5% = interest <span className="font-semibold">500 baht</span>
                      </>
                    )}
                  </span>
                </div>
                <div className="flex justify-between items-center gap-3">
                  <span>{isThai ? "งวด 2:" : "Installment 2:"}</span>
                  <span>
                    {isThai ? (
                      <>
                        เงินต้นคงเหลือ 6,667 × 5% = ดอกเบี้ย <span className="font-semibold">333 บาท</span>
                      </>
                    ) : (
                      <>
                        Remaining principal 6,667 × 5% = interest <span className="font-semibold">333 baht</span>
                      </>
                    )}
                  </span>
                </div>
                <div className="flex justify-between items-center gap-3">
                  <span>{isThai ? "งวด 3:" : "Installment 3:"}</span>
                  <span>
                    {isThai ? (
                      <>
                        เงินต้นคงเหลือ 3,333 × 5% = ดอกเบี้ย <span className="font-semibold">167 บาท</span>
                      </>
                    ) : (
                      <>
                        Remaining principal 3,333 × 5% = interest <span className="font-semibold">167 baht</span>
                      </>
                    )}
                  </span>
                </div>
                <div className="border-t border-border pt-2 mt-1">
                  <p>
                    {isThai ? (
                      <>
                        • ดอกเบี้ยรวม = 500 + 333 + 167 ={" "}
                        <span className="text-status-paid font-semibold">1,000 บาท</span>
                      </>
                    ) : (
                      <>
                        • Total interest = 500 + 333 + 167 ={" "}
                        <span className="text-status-paid font-semibold">1,000 baht</span>
                      </>
                    )}
                  </p>
                  <p className="text-status-paid font-medium mt-1">
                    {isThai ? "💰 ประหยัดไป 500 บาท เทียบกับดอกเบี้ยคงที่!" : "💰 Save 500 baht compared with fixed rate interest!"}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <span className="text-lg">✅</span>
              <div>
                <p className="font-medium text-foreground">{isThai ? "ข้อดี:" : "Pros:"}</p>
                <p>{isThai ? "จ่ายดอกเบี้ยน้อยกว่า ยิ่งจ่ายเร็วยิ่งประหยัด" : "Pays less interest, and paying faster saves more."}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <span className="text-lg">❌</span>
              <div>
                <p className="font-medium text-foreground">{isThai ? "ข้อเสีย:" : "Cons:"}</p>
                <p>{isThai ? "ยอดชำระแต่ละงวดไม่เท่ากัน (งวดแรกสูงกว่า)" : "Each payment can differ, with the first installment usually higher."}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-muted rounded-xl p-4">
          <h4 className="font-semibold text-foreground mb-3 text-center">
            {isThai ? "📊 เปรียบเทียบ (ยืม 10,000 บาท 5%/เดือน 3 งวด)" : "📊 Comparison (10,000 baht, 5% per month, 3 installments)"}
          </h4>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="bg-blue-500/10 rounded-lg p-3">
              <p className="text-sm text-muted-foreground">{isThai ? "ดอกเบี้ยคงที่" : "Fixed rate"}</p>
              <p className="text-xl font-bold text-foreground">1,500 บาท</p>
            </div>
            <div className="bg-green-500/10 rounded-lg p-3">
              <p className="text-sm text-muted-foreground">{isThai ? "ลดต้นลดดอก" : "Reducing balance"}</p>
              <p className="text-xl font-bold text-status-paid">1,000 บาท</p>
            </div>
          </div>
        </div>

        <div className="bg-primary/10 rounded-lg p-4 border border-primary/20">
          <p className="text-primary font-semibold mb-2">{isThai ? "💡 สรุปง่ายๆ:" : "💡 Quick summary:"}</p>
          <ul className="space-y-1">
            <li>
              • <span className="font-medium">{isThai ? "ลดต้นลดดอก" : "Reducing balance"}</span> ={" "}
              {isThai ? "ประหยัดกว่า แต่ยอดแต่ละงวดไม่เท่ากัน" : "cheaper overall, but each payment can be different"}
            </li>
            <li>
              • <span className="font-medium">{isThai ? "ดอกเบี้ยคงที่" : "Fixed rate"}</span> ={" "}
              {isThai ? "คำนวณง่าย จ่ายเท่าๆ กันทุกงวด" : "easy to calculate, with equal payments each time"}
            </li>
          </ul>
        </div>
      </div>
    ),
  },
  {
    id: "borrower-tips",
    icon: <BookOpen className="w-5 h-5" />,
    title: isThai ? "เคล็ดลับสำหรับผู้ยืม" : "Tips for borrowers",
    content: (
      <div className="space-y-4 text-sm text-muted-foreground">
        <p className="text-foreground font-medium">
          {isThai ? "วิธีจัดการหนี้อย่างชาญฉลาด:" : "Smart ways to manage debt:"}
        </p>

        <div className="border-l-4 border-primary pl-4 space-y-1">
          <p className="font-semibold text-foreground">
            {isThai ? "1. เลือกลดต้นลดดอกถ้าทำได้" : "1. Choose reducing balance when possible"}
          </p>
          <p>
            {isThai
              ? 'ถ้าผู้ให้ยืมยินยอม เลือก "ลดต้นลดดอก" จะประหยัดดอกเบี้ยมากกว่า'
              : 'If the lender agrees, "reducing balance" usually saves more interest.'}
          </p>
        </div>

        <div className="border-l-4 border-status-paid pl-4 space-y-1">
          <p className="font-semibold text-foreground">
            {isThai ? "2. จ่ายก่อนกำหนดถ้ามีเงินเหลือ" : "2. Pay early if you have extra cash"}
          </p>
          <p>
            {isThai
              ? "ถ้าเป็นแบบลดต้นลดดอก การจ่ายเพิ่มจะช่วยลดดอกเบี้ยงวดถัดไป"
              : "With reducing balance, extra payments lower the interest charged in future installments."}
          </p>
          <div className="bg-secondary/50 rounded p-2 mt-1">
            <p className="text-xs">
              {isThai
                ? '💡 ใช้ปุ่ม "จ่ายเพิ่ม" ในหน้ารายละเอียดข้อตกลง'
                : '💡 Use the "Extra payment" button on the agreement details page.'}
            </p>
          </div>
        </div>

        <div className="border-l-4 border-amber-500 pl-4 space-y-1">
          <p className="font-semibold text-foreground">
            {isThai ? "3. อย่ารอจนเลยกำหนด" : "3. Don’t wait until after the due date"}
          </p>
          <p>
            {isThai
              ? "ถ้าจ่ายไม่ทัน ขอเลื่อนนัดก่อนถึงวันครบกำหนด ค่าธรรมเนียมจะถูกกว่า"
              : "If you cannot pay on time, request a reschedule before the due date. The fee is usually lower."}
          </p>
        </div>

        <div className="border-l-4 border-blue-500 pl-4 space-y-1">
          <p className="font-semibold text-foreground">
            {isThai ? "4. ตั้งเตือนล่วงหน้า" : "4. Set reminders in advance"}
          </p>
          <p>{isThai ? "เปิดการแจ้งเตือนในแอป จะได้ไม่พลาดวันชำระ" : "Turn on app notifications so you do not miss a payment date."}</p>
        </div>

        <div className="border-l-4 border-purple-500 pl-4 space-y-1">
          <p className="font-semibold text-foreground">
            {isThai ? "5. คำนวณก่อนยืม" : "5. Calculate before you borrow"}
          </p>
          <p>{isThai ? "ดูยอดรวมที่ต้องจ่ายก่อนตกลง ถามตัวเองว่าไหวไหม" : "Check the total amount due first and ask yourself whether it is manageable."}</p>
          <div className="bg-secondary/50 rounded p-2 mt-1">
            <p className="text-xs">
              {isThai
                ? "📐 สูตร: ถ้ายอดต่องวด > 30% ของรายได้ = ควรพิจารณาใหม่"
                : "📐 Rule of thumb: if each installment is more than 30% of income, reconsider."}
            </p>
          </div>
        </div>

        <div className="bg-status-paid/10 rounded-lg p-4 border border-status-paid/20 mt-4">
          <p className="text-status-paid font-semibold mb-2">{isThai ? "✨ สรุปปฏิบัติ:" : "✨ Practical summary:"}</p>
          <ol className="space-y-1 list-decimal list-inside">
            <li>{isThai ? "เลือกลดต้นลดดอกถ้าได้" : "Choose reducing balance when possible"}</li>
            <li>{isThai ? "จ่ายตรงเวลาหรือก่อนเวลา" : "Pay on time or early"}</li>
            <li>{isThai ? "มีปัญหา รีบขอเลื่อนนัด" : "If there is a problem, request a reschedule quickly"}</li>
            <li>{isThai ? "เปิดแจ้งเตือนทุกข้อตกลง" : "Enable notifications for every agreement"}</li>
          </ol>
        </div>
      </div>
    ),
  },
  {
    id: "installment-calculation",
    icon: <Calculator className="w-5 h-5" />,
    title: isThai ? "การคำนวณงวดชำระ" : "Installment calculations",
    content: (
      <div className="space-y-4 text-sm text-muted-foreground">
        <p>
          {isThai
            ? "BudOverBills ช่วยคำนวณงวดให้อัตโนมัติตามประเภทดอกเบี้ยที่เลือก"
            : "BudOverBills calculates installments automatically based on the interest type you choose."}
        </p>

        <div>
          <h4 className="font-medium text-foreground mb-2">
            {isThai ? "📐 สูตรคำนวณดอกเบี้ยคงที่" : "📐 Fixed rate formula"}
          </h4>
          <div className="bg-secondary/50 rounded-lg p-3">
            <p>{isThai ? "ยอดต่องวด = (เงินต้น + ดอกเบี้ยรวม) ÷ จำนวนงวด" : "Per installment = (principal + total interest) ÷ number of installments"}</p>
          </div>
        </div>

        <div>
          <h4 className="font-medium text-foreground mb-2">
            {isThai ? "📊 สูตรคำนวณลดต้นลดดอก" : "📊 Reducing balance formula"}
          </h4>
          <div className="bg-secondary/50 rounded-lg p-3">
            <p>{isThai ? "เงินต้นต่องวด = เงินต้น ÷ จำนวนงวด" : "Principal per installment = principal ÷ number of installments"}</p>
            <p>{isThai ? "ดอกเบี้ยต่องวด = เงินต้นคงเหลือ × อัตราดอกเบี้ย" : "Interest per installment = remaining principal × interest rate"}</p>
          </div>
        </div>

        <div className="bg-amber-500/10 rounded-lg p-3 border border-amber-500/20">
          <p className="text-amber-600 font-medium">{isThai ? "⚠️ สำคัญ:" : "⚠️ Important:"}</p>
          <p>{isThai ? "ผลรวมของทุกงวดต้องเท่ากับยอดรวมพอดี" : "The sum of all installments must match the total amount exactly."}</p>
        </div>
      </div>
    ),
  },
  {
    id: "reschedule-fee",
    icon: <Clock className="w-5 h-5" />,
    title: isThai ? "ค่าธรรมเนียมเลื่อนนัด" : "Reschedule fees",
    content: (
      <div className="space-y-4 text-sm text-muted-foreground">
        <p>
          {isThai
            ? "หากต้องการเลื่อนวันชำระ จะมีค่าธรรมเนียมตามที่ตกลงในข้อตกลง"
            : "If you need to move a payment date, a fee is charged according to the agreement."}
        </p>

        <div>
          <h4 className="font-medium text-foreground mb-2">
            {isThai ? "💰 การคำนวณค่าเลื่อนนัด" : "💰 Reschedule fee calculation"}
          </h4>
          <div className="bg-secondary/50 rounded-lg p-3">
            <p>{isThai ? "ค่าเลื่อนนัด = ยอดงวด × อัตราค่าเลื่อนนัด" : "Reschedule fee = installment amount × reschedule rate"}</p>
            <p className="mt-2">{isThai ? "ตัวอย่าง: งวด 3,000 บาท × 3% = 90 บาท" : "Example: 3,000 baht installment × 3% = 90 baht"}</p>
          </div>
        </div>

        <div>
          <h4 className="font-medium text-foreground mb-2">
            {isThai ? "📅 การแบ่งจ่ายค่าเลื่อนนัด" : "📅 Splitting the reschedule fee"}
          </h4>
          <p>{isThai ? "สามารถเลือกแบ่งจ่ายค่าเลื่อนนัดเป็นงวดๆ ได้ (1-6 งวด)" : "You can split the reschedule fee into installments (1-6 payments)."}</p>
        </div>

        <div className="bg-primary/10 rounded-lg p-3 border border-primary/20">
          <p className="text-primary font-medium">{isThai ? "💡 เคล็ดลับ:" : "💡 Tip:"}</p>
          <p>{isThai ? "ขอเลื่อนนัดล่วงหน้าก่อนถึงวันครบกำหนดจะดีที่สุด" : "It is best to request a reschedule before the due date."}</p>
        </div>
      </div>
    ),
  },
];

const buildGuideArticles = (isThai: boolean): HelpArticle[] => [
  {
    id: "create-agreement",
    icon: <FileText className="w-5 h-5" />,
    title: isThai ? "วิธีสร้างข้อตกลง" : "How to create an agreement",
    content: (
      <div className="space-y-4 text-sm text-muted-foreground">
        <p>{isThai ? "ผู้ให้ยืมเป็นคนสร้างข้อตกลง ผู้ยืมเป็นคนยืนยัน" : "The lender creates the agreement and the borrower confirms it."}</p>

        <div className="space-y-3">
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">1</span>
            <p>{isThai ? 'กดปุ่ม "สร้างข้อตกลง" ที่แถบด้านล่าง' : 'Tap the "Create agreement" button in the bottom bar.'}</p>
          </div>
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">2</span>
            <p>{isThai ? "เลือกเพื่อนที่จะเป็นผู้ยืม (ต้องเพิ่มเพื่อนก่อน)" : "Choose the friend who will be the borrower (you must add them first)."}</p>
          </div>
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">3</span>
            <p>{isThai ? "กรอกจำนวนเงิน ดอกเบี้ย และจำนวนงวด" : "Enter the amount, interest, and number of installments."}</p>
          </div>
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">4</span>
            <p>{isThai ? "ตรวจสอบและกดสร้างข้อตกลง" : "Review the details and create the agreement."}</p>
          </div>
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">5</span>
            <p>{isThai ? "รอผู้ยืมยืนยันข้อตกลงเพื่อเริ่มสัญญา" : "Wait for the borrower to confirm the agreement to start the contract."}</p>
          </div>
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">6</span>
            <p>{isThai ? "ผู้ยืมยืนยันรับเงิน → ข้อตกลงเริ่มต้น" : "The borrower confirms receipt of funds, and the agreement starts."}</p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "confirm-payment",
    icon: <CreditCard className="w-5 h-5" />,
    title: isThai ? "วิธียืนยันการชำระ" : "How to confirm payment",
    content: (
      <div className="space-y-4 text-sm text-muted-foreground">
        <div>
          <h4 className="font-medium text-foreground mb-2">{isThai ? "👤 สำหรับผู้ยืม" : "👤 For borrowers"}</h4>
          <ol className="space-y-2 list-decimal list-inside">
            <li>{isThai ? "โอนเงินตามยอดและบัญชีที่ระบุ" : "Transfer the amount to the listed account."}</li>
            <li>{isThai ? "กดที่งวดที่ต้องการชำระในปฏิทิน" : "Tap the installment you want to pay in the calendar."}</li>
            <li>{isThai ? "อัพโหลดสลิปการโอน" : "Upload the transfer slip."}</li>
            <li>{isThai ? "รอผู้ให้ยืมยืนยัน" : "Wait for the lender to confirm."}</li>
          </ol>
        </div>

        <div>
          <h4 className="font-medium text-foreground mb-2">{isThai ? "🏦 สำหรับผู้ให้ยืม" : "🏦 For lenders"}</h4>
          <ol className="space-y-2 list-decimal list-inside">
            <li>{isThai ? "เมื่อได้รับแจ้งเตือน ให้กดดูสลิป" : "When you get a notification, open the slip."}</li>
            <li>{isThai ? "ตรวจสอบยอดและวันที่โอน" : "Check the amount and transfer date."}</li>
            <li>{isThai ? 'กด "ยืนยันรับเงิน" หากถูกต้อง' : 'Tap "Confirm receipt" if everything is correct.'}</li>
          </ol>
        </div>
      </div>
    ),
  },
  {
    id: "add-friend",
    icon: <Users className="w-5 h-5" />,
    title: isThai ? "วิธีเพิ่มเพื่อน" : "How to add a friend",
    content: (
      <div className="space-y-4 text-sm text-muted-foreground">
        <p>{isThai ? "ต้องเพิ่มเพื่อนก่อนจึงจะสร้างข้อตกลงได้" : "You need to add friends before you can create an agreement."}</p>

        <div className="space-y-3">
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">1</span>
            <p>{isThai ? "ไปที่โปรไฟล์ → เพื่อน" : "Go to Profile → Friends."}</p>
          </div>
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">2</span>
            <p>{isThai ? "กรอกรหัสผู้ใช้ของเพื่อน (6 ตัวอักษร)" : "Enter your friend's user code (6 characters)."}</p>
          </div>
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">3</span>
            <p>{isThai ? "กดส่งคำขอเป็นเพื่อน" : "Send the friend request."}</p>
          </div>
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">4</span>
            <p>{isThai ? "รอเพื่อนยอมรับคำขอ" : "Wait for your friend to accept."}</p>
          </div>
        </div>

        <div className="bg-primary/10 rounded-lg p-3 border border-primary/20">
          <p className="text-primary font-medium">{isThai ? "💡 เคล็ดลับ:" : "💡 Tip:"}</p>
          <p>{isThai ? "ดูรหัสผู้ใช้ของตัวเองได้ที่หน้าโปรไฟล์" : "You can find your own user code on the Profile page."}</p>
        </div>
      </div>
    ),
  },
  {
    id: "reschedule-request",
    icon: <RefreshCw className="w-5 h-5" />,
    title: isThai ? "วิธีขอเลื่อนนัด" : "How to request a reschedule",
    content: (
      <div className="space-y-4 text-sm text-muted-foreground">
        <p>{isThai ? "หากไม่สามารถชำระตามกำหนดได้ สามารถขอเลื่อนนัดได้" : "If you cannot pay on time, you can request a reschedule."}</p>

        <div className="space-y-3">
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">1</span>
            <p>{isThai ? "กดที่งวดที่ต้องการเลื่อนในปฏิทิน" : "Tap the installment you want to move in the calendar."}</p>
          </div>
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">2</span>
            <p>{isThai ? 'เลือก "ขอเลื่อนนัด"' : 'Choose "Request reschedule".'}</p>
          </div>
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">3</span>
            <p>{isThai ? "เลือกวันที่ใหม่ที่ต้องการ" : "Pick the new date you want."}</p>
          </div>
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">4</span>
            <p>{isThai ? "ชำระค่าธรรมเนียมเลื่อนนัด (ถ้ามี)" : "Pay the reschedule fee if required."}</p>
          </div>
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">5</span>
            <p>{isThai ? "รอผู้ให้ยืมอนุมัติ" : "Wait for the lender to approve."}</p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "calendar-usage",
    icon: <CalendarCheck className="w-5 h-5" />,
    title: isThai ? "วิธีดูปฏิทินชำระ" : "How to use the payment calendar",
    content: (
      <div className="space-y-4 text-sm text-muted-foreground">
        <p>{isThai ? "ปฏิทินแสดงงวดที่ต้องชำระในเดือนนี้ แยกตามความถี่" : "The calendar shows installments due this month, grouped by frequency."}</p>

        <div>
          <h4 className="font-medium text-foreground mb-2">{isThai ? "📅 หน้าปฏิทิน" : "📅 Calendar view"}</h4>
          <ul className="space-y-2">
            <li>
              • <span className="text-status-paid font-medium">{isThai ? "สีเขียว" : "Green"}</span> ={" "}
              {isThai ? "ชำระครบแล้ว" : "paid in full"}
            </li>
            <li>
              • <span className="text-status-pending font-medium">{isThai ? "สีเหลือง" : "Yellow"}</span> ={" "}
              {isThai ? "รอยืนยัน" : "waiting for confirmation"}
            </li>
            <li>
              • <span className="text-status-overdue font-medium">{isThai ? "สีส้ม" : "Orange"}</span> ={" "}
              {isThai ? "เลยกำหนด" : "overdue"}
            </li>
          </ul>
        </div>

        <div>
          <h4 className="font-medium text-foreground mb-2">{isThai ? "🖱️ การใช้งาน" : "🖱️ How to use it"}</h4>
          <ol className="space-y-2 list-decimal list-inside">
            <li>{isThai ? "กดที่การ์ดความถี่ (รายวัน/รายสัปดาห์/รายเดือน)" : "Tap a frequency card (daily/weekly/monthly)."}</li>
            <li>{isThai ? "ดูงวดทั้งหมดในเดือนนั้น" : "Review all installments in that month."}</li>
            <li>{isThai ? "กดที่งวดเพื่อชำระหรือขอเลื่อนนัด" : "Tap an installment to pay or request a reschedule."}</li>
          </ol>
        </div>

        <div className="bg-primary/10 rounded-lg p-3 border border-primary/20">
          <p className="text-primary font-medium">{isThai ? "💡 เคล็ดลับ:" : "💡 Tip:"}</p>
          <p>{isThai ? "กดดูรายละเอียดข้อตกลงได้จากหน้าปฏิทิน" : "You can open agreement details from the calendar screen."}</p>
        </div>
      </div>
    ),
  },
  {
    id: "bank-account-setup",
    icon: <Building2 className="w-5 h-5" />,
    title: isThai ? "วิธีตั้งค่าบัญชีธนาคาร" : "How to set up a bank account",
    content: (
      <div className="space-y-4 text-sm text-muted-foreground">
        <p>{isThai ? "ผู้ให้ยืมต้องตั้งค่าบัญชีธนาคารเพื่อรับเงินชำระ" : "Lenders need to set up a bank account to receive payments."}</p>

        <div className="space-y-3">
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">1</span>
            <p>{isThai ? "ไปที่หน้าโปรไฟล์" : "Open the Profile page."}</p>
          </div>
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">2</span>
            <p>{isThai ? 'กดที่การ์ด "บัญชีธนาคาร"' : 'Tap the "Bank account" card.'}</p>
          </div>
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">3</span>
            <p>{isThai ? "เลือกธนาคาร กรอกเลขบัญชี และชื่อบัญชี" : "Select a bank, enter the account number, and add the account name."}</p>
          </div>
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">4</span>
            <p>{isThai ? "กดบันทึก" : "Save the changes."}</p>
          </div>
        </div>

        <div className="bg-amber-500/10 rounded-lg p-3 border border-amber-500/20">
          <p className="text-amber-600 font-medium">{isThai ? "⚠️ สำคัญ:" : "⚠️ Important:"}</p>
          <p>{isThai ? "ต้องตั้งค่าบัญชีก่อนจึงจะยืนยันข้อตกลงในฐานะผู้ให้ยืมได้" : "You must set up a bank account before confirming agreements as a lender."}</p>
        </div>
      </div>
    ),
  },
  {
    id: "edit-profile",
    icon: <UserCog className="w-5 h-5" />,
    title: isThai ? "วิธีแก้ไขโปรไฟล์" : "How to edit your profile",
    content: (
      <div className="space-y-4 text-sm text-muted-foreground">
        <p>{isThai ? "คุณสามารถเปลี่ยนชื่อและรูปโปรไฟล์ได้ตลอดเวลา" : "You can change your name and profile picture at any time."}</p>

        <div className="space-y-3">
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">1</span>
            <p>{isThai ? "ไปที่หน้าโปรไฟล์" : "Open the Profile page."}</p>
          </div>
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">2</span>
            <p>{isThai ? "กดที่รูปโปรไฟล์หรือชื่อ" : "Tap your profile picture or name."}</p>
          </div>
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">3</span>
            <p>{isThai ? "อัพโหลดรูปใหม่หรือแก้ไขชื่อ" : "Upload a new photo or edit your name."}</p>
          </div>
          <div className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">4</span>
            <p>{isThai ? "กดบันทึกการเปลี่ยนแปลง" : "Save your changes."}</p>
          </div>
        </div>

        <div className="bg-primary/10 rounded-lg p-3 border border-primary/20">
          <p className="text-primary font-medium">{isThai ? "💡 หมายเหตุ:" : "💡 Note:"}</p>
          <p>{isThai ? "รหัสผู้ใช้ 6 หลักไม่สามารถเปลี่ยนได้ ใช้สำหรับให้เพื่อนเพิ่มคุณ" : "Your 6-character user code cannot be changed. Friends use it to add you."}</p>
        </div>
      </div>
    ),
  },
];

const buildFaqArticles = (isThai: boolean): HelpArticle[] => [
  {
    id: "forgot-password",
    icon: <Shield className="w-5 h-5" />,
    title: isThai ? "ลืมรหัสผ่าน ทำอย่างไร?" : "Forgot your password?",
    content: (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>
          {isThai
            ? 'ที่หน้าเข้าสู่ระบบ กดที่ "ลืมรหัสผ่าน" แล้วกรอกอีเมลที่ใช้สมัคร ระบบจะส่งลิงก์รีเซ็ตรหัสผ่านไปที่อีเมลของคุณ'
            : 'On the sign-in page, tap "Forgot password" and enter the email you used to register. The app will send a reset link to your email.'}
        </p>
      </div>
    ),
  },
  {
    id: "edit-agreement",
    icon: <FileText className="w-5 h-5" />,
    title: isThai ? "แก้ไขข้อตกลงได้ไหม?" : "Can I edit an agreement?",
    content: (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>
          {isThai
            ? "ข้อตกลงที่ได้รับการยืนยันแล้วไม่สามารถแก้ไขได้ เพื่อความโปร่งใสและป้องกันการเปลี่ยนแปลงย้อนหลัง"
            : "Once an agreement is confirmed, it cannot be edited. This keeps the record transparent and prevents retroactive changes."}
        </p>
        <p>
          {isThai
            ? "หากต้องการเปลี่ยนแปลง ให้ยกเลิกข้อตกลงเดิมและสร้างใหม่ (ต้องได้รับความยินยอมจากทั้งสองฝ่าย)"
            : "If changes are needed, cancel the original agreement and create a new one with consent from both parties."}
        </p>
      </div>
    ),
  },
  {
    id: "contact-support",
    icon: <MessageCircle className="w-5 h-5" />,
    title: isThai ? "ติดต่อทีมงานอย่างไร?" : "How do I contact the team?",
    content: (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>{isThai ? "คุณสามารถติดต่อเราได้ที่:" : "You can contact us at:"}</p>
        <ul className="space-y-2">
          <li>• {isThai ? "อีเมล: support@budoverbills.com" : "Email: support@budoverbills.com"}</li>
          <li>{isThai ? '• หรือกดที่ "เลี้ยงกาแฟทีมงาน" เพื่อสนับสนุนเรา' : '• Or tap "Buy the team a coffee" to support us.'}</li>
        </ul>
      </div>
    ),
  },
  {
    id: "data-security",
    icon: <Shield className="w-5 h-5" />,
    title: isThai ? "ข้อมูลปลอดภัยไหม?" : "Is my data safe?",
    content: (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>{isThai ? "BudOverBills ใช้มาตรการความปลอดภัยหลายชั้น:" : "BudOverBills uses several layers of security:"}</p>
        <ul className="space-y-2">
          <li>{isThai ? "• การเข้ารหัสข้อมูลแบบ End-to-end" : "• End-to-end data encryption"}</li>
          <li>{isThai ? "• ไม่เก็บรหัสผ่านเป็น plain text" : "• Passwords are not stored as plain text"}</li>
          <li>{isThai ? "• มีระบบยืนยันตัวตนสองชั้น" : "• Two-factor authentication is available"}</li>
          <li>{isThai ? "• ปฏิบัติตาม PDPA" : "• PDPA-compliant practices"}</li>
          <li>{isThai ? "• จำกัดสิทธิ์เข้าถึงข้อมูลเฉพาะส่วนที่จำเป็น" : "• Access is limited to only what is necessary"}</li>
        </ul>
      </div>
    ),
  },
  {
    id: "subscription-benefits",
    icon: <CreditCard className="w-5 h-5" />,
    title: isThai ? "สมัครสมาชิกได้อะไรบ้าง?" : "What do I get with a subscription?",
    content: (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>
          {isThai
            ? "ผู้ใช้ฟรีสามารถสร้างข้อตกลงได้ 2 รายการ หลังจากนั้นสามารถ:"
            : "Free users can create 2 agreements. After that, you can either:"}
        </p>
        <ul className="space-y-2">
          <li>
            {isThai
              ? "• ซื้อเครดิตสร้างข้อตกลงเพิ่ม (29 บาท/รายการ)"
              : "• Buy extra agreement credits (29 baht each)"}
          </li>
          <li>
            {isThai
              ? "• หรือสมัครสมาชิกรายเดือน เพื่อสร้างไม่จำกัด"
              : "• Subscribe monthly for unlimited agreements"}
          </li>
        </ul>
      </div>
    ),
  },
];

const buildCategoryInfo = (isThai: boolean) => ({
  finance: {
    icon: <Calculator className="w-6 h-6" />,
    title: isThai ? "ความรู้การเงิน" : "Finance",
    description: isThai ? "เรียนรู้เกี่ยวกับดอกเบี้ยและการคำนวณ" : "Learn about interest and calculations",
    color: "from-blue-500/20 to-blue-500/5 border-blue-500/20",
    articles: buildFinanceArticles(isThai),
  },
  guide: {
    icon: <BookOpen className="w-6 h-6" />,
    title: isThai ? "คู่มือใช้งาน" : "How To",
    description: isThai ? "วิธีใช้งานฟีเจอร์ต่างๆ" : "How to use the app features",
    color: "from-green-500/20 to-green-500/5 border-green-500/20",
    articles: buildGuideArticles(isThai),
  },
  faq: {
    icon: <HelpCircle className="w-6 h-6" />,
    title: isThai ? "คำถามที่พบบ่อย" : "FAQ",
    description: isThai ? "คำตอบสำหรับคำถามทั่วไป" : "Answers to common questions",
    color: "from-amber-500/20 to-amber-500/5 border-amber-500/20",
    articles: buildFaqArticles(isThai),
  },
});

export default function Help() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const [selectedCategory, setSelectedCategory] = useState<HelpCategory>(null);
  const isThai = language === "th";
  const copy: HelpCopy = isThai ? HELP_COPY.th : HELP_COPY.en;
  const categoryInfo = buildCategoryInfo(isThai);

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
    <PageTransition>
    <div className="min-h-screen bg-gradient-hero pb-24">
      <div className="max-w-lg mx-auto px-4">
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-4 py-4"
        >
          <button
            type="button"
            onClick={handleBack}
            aria-label={selectedCategory ? "กลับไปหน้ารวมหมวดหมู่" : "กลับไปหน้าก่อนหน้า"}
            className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-secondary-foreground" />
          </button>
          <div>
            <h1 className="text-xl font-heading font-semibold text-foreground">
              {selectedCategory ? categoryInfo[selectedCategory].title : copy.title}
            </h1>
            <p className="text-sm text-muted-foreground">
              {selectedCategory ? categoryInfo[selectedCategory].description : copy.subtitle}
            </p>
          </div>
        </motion.header>

        {!selectedCategory && (
          <div className="space-y-4">
            {(Object.keys(categoryInfo) as Array<Exclude<HelpCategory, null>>).map((key, index) => {
              const category = categoryInfo[key];
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
                        <p className="font-heading font-semibold text-foreground">{category.title}</p>
                        <p className="text-sm text-muted-foreground">{category.description}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {category.articles.length} {copy.articleCount}
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

        {selectedCategory && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            <Accordion type="single" collapsible className="space-y-3">
              {categoryInfo[selectedCategory].articles.map((article, index) => (
                <motion.div
                  key={article.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <AccordionItem value={article.id} className="bg-card rounded-2xl shadow-card border-none overflow-hidden">
                    <AccordionTrigger className="px-4 py-4 hover:no-underline hover:bg-secondary/50">
                      <div className="flex items-center gap-3 text-left">
                        <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                          {article.icon}
                        </div>
                        <span className="font-medium text-foreground">
                          {copy.articleTitles[article.id as keyof typeof copy.articleTitles] || article.title}
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4">{article.content}</AccordionContent>
                  </AccordionItem>
                </motion.div>
              ))}
            </Accordion>
          </motion.div>
        )}
      </div>

    </div>
    </PageTransition>
  );
}

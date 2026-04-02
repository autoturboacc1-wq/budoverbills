import { ArrowLeft, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const Terms = () => {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <Link to="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-lg font-semibold">ข้อตกลงการใช้งาน</h1>
        </div>
      </header>

      <main className="p-4 pb-24 max-w-3xl mx-auto">
        <div className="space-y-6 text-foreground/80">
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">1. About Bud Over Bills</h2>
            <p className="leading-relaxed">
              Bud Over Bills (BOB) เป็นแพลตฟอร์มดิจิทัลที่ช่วยบันทึกและจัดการ <strong>คำมั่นและข้อตกลงส่วนบุคคล</strong> ระหว่างผู้ใช้งาน
            </p>
            <p className="leading-relaxed mt-2 text-muted-foreground">
              Bud Over Bills ไม่ใช่สถาบันการเงิน, ไม่ให้กู้เงิน, และ <strong>ไม่เป็นคนกลางในการถือหรือโอนเงิน</strong>
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">2. Nature of the Service</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Bud Over Bills ทำหน้าที่เป็น <strong>เครื่องมือบันทึกข้อตกลง</strong></li>
              <li>ข้อตกลงทั้งหมดเกิดขึ้น <strong>โดยสมัครใจระหว่างผู้ใช้งาน</strong></li>
              <li>Bud Over Bills ไม่มีส่วนเกี่ยวข้อง กับการชำระเงินจริง ผลตอบแทน หรือดอกเบี้ยใด ๆ</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">3. No Financial Intermediation</h2>
            <div className="bg-secondary/50 rounded-xl p-4 space-y-2">
              <p className="font-medium text-foreground">Bud Over Bills:</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <XCircle className="w-4 h-4 text-destructive shrink-0" />
                  <span>ไม่รับฝากเงิน</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <XCircle className="w-4 h-4 text-destructive shrink-0" />
                  <span>ไม่โอนเงินแทนผู้ใช้</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <XCircle className="w-4 h-4 text-destructive shrink-0" />
                  <span>ไม่รับประกันการชำระ</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <XCircle className="w-4 h-4 text-destructive shrink-0" />
                  <span>ไม่บังคับให้ผู้ใช้ปฏิบัติตามข้อตกลง</span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground pt-2 border-t border-border">
                ผู้ใช้รับผิดชอบการตกลงและการชำระกันเองทั้งหมด
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">4. User Responsibility</h2>
            <p className="leading-relaxed mb-3">ผู้ใช้ตกลงว่า:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>ข้อมูลที่บันทึกเป็นความจริง</li>
              <li>ใช้งานด้วยความสุจริต</li>
              <li>ไม่ใช้ Bud Over Bills เพื่อกิจกรรมที่ผิดกฎหมาย หลอกลวง หรือเอาเปรียบผู้อื่น</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">5. No Guarantee</h2>
            <p className="leading-relaxed">
              Bud Over Bills <strong>ไม่รับประกัน</strong> ว่าผู้ใช้จะปฏิบัติตามข้อตกลง
            </p>
            <p className="leading-relaxed mt-2">
              Bud Over Bills ไม่รับผิดชอบต่อความเสียหายใด ๆ ที่เกิดจากการผิดคำมั่นระหว่างผู้ใช้
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">6. Limitation of Liability</h2>
            <p className="leading-relaxed mb-3">Bud Over Bills จะไม่รับผิดชอบต่อ:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>ความเสียหายทางการเงิน</li>
              <li>ข้อพิพาทระหว่างผู้ใช้</li>
              <li>การสูญเสียความสัมพันธ์ส่วนบุคคล</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">7. Service Changes</h2>
            <p className="leading-relaxed mb-3">Bud Over Bills ขอสงวนสิทธิ์ในการ:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>ปรับปรุง เปลี่ยนแปลง หรือยุติบริการ</li>
              <li>แก้ไขข้อตกลงนี้โดยไม่ต้องแจ้งล่วงหน้า</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">8. Governing Law</h2>
            <p className="leading-relaxed">
              ข้อตกลงนี้อยู่ภายใต้กฎหมายประเทศไทย
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">9. ติดต่อเรา</h2>
            <p className="leading-relaxed">
              หากมีคำถามเกี่ยวกับข้อตกลงการใช้งาน สามารถติดต่อเราได้ที่{' '}
              <a href="mailto:support@budoverbills.com" className="text-primary hover:underline">
                support@budoverbills.com
              </a>
            </p>
          </section>

          <p className="text-sm text-muted-foreground pt-4 border-t border-border">
            ปรับปรุงล่าสุด: 5 มกราคม 2569
          </p>
        </div>
      </main>
    </div>
  );
};

export default Terms;
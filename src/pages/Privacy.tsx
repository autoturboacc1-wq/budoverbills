import { ArrowLeft, XCircle, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const Privacy = () => {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <Link to="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-lg font-semibold">นโยบายความเป็นส่วนตัว</h1>
        </div>
      </header>

      <main className="p-4 pb-24 max-w-3xl mx-auto">
        <div className="space-y-6 text-foreground/80">
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">1. Information We Collect</h2>
            <p className="leading-relaxed mb-3">Bud Over Bills อาจเก็บข้อมูล:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>ชื่อเล่น / ชื่อที่แสดง</li>
              <li>อีเมล / เบอร์โทร (ถ้ามี)</li>
              <li>ข้อมูลข้อตกลงที่ผู้ใช้บันทึก</li>
              <li>ข้อมูลการใช้งานแอพ</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">2. How We Use Information</h2>
            <p className="leading-relaxed mb-3">ใช้เพื่อ:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>ให้บริการตามฟังก์ชันแอพ</li>
              <li>ปรับปรุงประสบการณ์ผู้ใช้</li>
              <li>ติดต่อเกี่ยวกับการใช้งาน</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">3. No Financial Data Collection</h2>
            <div className="bg-secondary/50 rounded-xl p-4 space-y-2">
              <p className="font-medium text-foreground">Bud Over Bills:</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <XCircle className="w-4 h-4 text-destructive shrink-0" />
                  <span>ไม่เก็บข้อมูลบัตร</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <XCircle className="w-4 h-4 text-destructive shrink-0" />
                  <span>ไม่เก็บข้อมูลบัญชีธนาคาร</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <XCircle className="w-4 h-4 text-destructive shrink-0" />
                  <span>ไม่เข้าถึงธุรกรรมการเงินจริง</span>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">4. Data Sharing</h2>
            <p className="leading-relaxed mb-3">Bud Over Bills:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>ไม่ขายข้อมูลผู้ใช้</li>
              <li>ไม่แชร์ข้อมูลกับบุคคลที่สาม ยกเว้น:
                <ul className="list-disc pl-6 mt-2 space-y-1">
                  <li>เพื่อการทำงานของระบบ</li>
                  <li>ตามที่กฎหมายกำหนด</li>
                </ul>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">5. Data Security</h2>
            <div className="bg-primary/10 rounded-xl p-4 border border-primary/20">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="leading-relaxed font-medium text-foreground">
                    Bud Over Bills ใช้มาตรการที่เหมาะสมเพื่อปกป้องข้อมูล
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    แต่ไม่สามารถรับประกันความปลอดภัยได้ 100%
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">6. User Rights</h2>
            <p className="leading-relaxed mb-3">ผู้ใช้สามารถ:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>ขอแก้ไขข้อมูล</li>
              <li>ขอให้ลบข้อมูล</li>
              <li>ยุติการใช้งานได้ทุกเมื่อ</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">7. Policy Changes</h2>
            <p className="leading-relaxed">
              Bud Over Bills อาจปรับปรุงนโยบายนี้เป็นครั้งคราว การใช้งานต่อถือว่ายอมรับการเปลี่ยนแปลง
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">8. Contact</h2>
            <p className="leading-relaxed">
              หากมีคำถามเกี่ยวกับ Terms หรือ Privacy สามารถติดต่อได้ที่{' '}
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

export default Privacy;
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';

const Terms = () => {
  const { language } = useLanguage();
  const copy = language === 'th'
    ? {
        title: 'ข้อตกลงการใช้งาน',
        sections: [
          {
            heading: '1. เกี่ยวกับ Bud Over Bills',
            body: [
              'Bud Over Bills เป็นแพลตฟอร์มดิจิทัลที่ช่วยบันทึกและจัดการคำมั่นและข้อตกลงส่วนบุคคลระหว่างผู้ใช้งาน',
              'Bud Over Bills ไม่ใช่สถาบันการเงิน ไม่ให้กู้เงิน และไม่เป็นคนกลางในการถือหรือโอนเงิน',
            ],
          },
          {
            heading: '2. ลักษณะของบริการ',
            list: [
              'Bud Over Bills ทำหน้าที่เป็นเครื่องมือบันทึกข้อตกลง',
              'ข้อตกลงทั้งหมดเกิดขึ้นโดยสมัครใจระหว่างผู้ใช้งาน',
              'Bud Over Bills ไม่มีส่วนเกี่ยวข้องกับการชำระเงินจริง ผลตอบแทน หรือดอกเบี้ยใด ๆ',
            ],
          },
          {
            heading: '3. ไม่มีการเป็นตัวกลางทางการเงิน',
            intro: 'Bud Over Bills:',
            list: [
              'ไม่รับฝากเงิน',
              'ไม่โอนเงินแทนผู้ใช้',
              'ไม่รับประกันการชำระ',
              'ไม่บังคับให้ผู้ใช้ปฏิบัติตามข้อตกลง',
            ],
            footer: 'ผู้ใช้รับผิดชอบการตกลงและการชำระกันเองทั้งหมด',
          },
          {
            heading: '4. ความรับผิดชอบของผู้ใช้',
            intro: 'ผู้ใช้ตกลงว่า:',
            list: [
              'ข้อมูลที่บันทึกเป็นความจริง',
              'ใช้งานด้วยความสุจริต',
              'ไม่ใช้ Bud Over Bills เพื่อกิจกรรมที่ผิดกฎหมาย หลอกลวง หรือเอาเปรียบผู้อื่น',
            ],
          },
          {
            heading: '5. ไม่มีการรับประกัน',
            body: [
              'Bud Over Bills ไม่รับประกันว่าผู้ใช้จะปฏิบัติตามข้อตกลง',
              'Bud Over Bills ไม่รับผิดชอบต่อความเสียหายใด ๆ ที่เกิดจากการผิดคำมั่นระหว่างผู้ใช้',
            ],
          },
          {
            heading: '6. การจำกัดความรับผิด',
            intro: 'Bud Over Bills จะไม่รับผิดชอบต่อ:',
            list: ['ความเสียหายทางการเงิน', 'ข้อพิพาทระหว่างผู้ใช้', 'การสูญเสียความสัมพันธ์ส่วนบุคคล'],
          },
          {
            heading: '7. การเปลี่ยนแปลงบริการ',
            intro: 'Bud Over Bills ขอสงวนสิทธิ์ในการ:',
            list: ['ปรับปรุง เปลี่ยนแปลง หรือยุติบริการ', 'แก้ไขข้อตกลงนี้โดยไม่ต้องแจ้งล่วงหน้า'],
          },
          { heading: '8. กฎหมายที่ใช้บังคับ', body: ['ข้อตกลงนี้อยู่ภายใต้กฎหมายประเทศไทย'] },
          {
            heading: '9. ติดต่อเรา',
            body: [
              <>
                หากมีคำถามเกี่ยวกับข้อตกลงการใช้งาน สามารถติดต่อเราได้ที่{' '}
                <a href="mailto:support@budoverbills.com" className="text-primary hover:underline">
                  support@budoverbills.com
                </a>
              </>,
            ],
          },
        ],
        updated: 'ปรับปรุงล่าสุด: 5 มกราคม 2569',
      }
    : {
        title: 'Terms of Use',
        sections: [
          {
            heading: '1. About Bud Over Bills',
            body: [
              'Bud Over Bills is a digital platform that helps users record and manage personal promises and agreements.',
              'Bud Over Bills is not a financial institution, does not lend money, and does not act as an intermediary for holding or transferring funds.',
            ],
          },
          {
            heading: '2. Nature of the Service',
            list: [
              'Bud Over Bills acts as a tool for recording agreements.',
              'All agreements are entered into voluntarily by users.',
              'Bud Over Bills is not involved in the actual payment, returns, or interest of any funds.',
            ],
          },
          {
            heading: '3. No Financial Intermediation',
            intro: 'Bud Over Bills:',
            list: ['Does not accept deposits', 'Does not transfer money on behalf of users', 'Does not guarantee payment', 'Does not force users to comply with agreements'],
            footer: 'Users are solely responsible for their own agreements and settlements.',
          },
          {
            heading: '4. User Responsibility',
            intro: 'Users agree that:',
            list: [
              'The information they record is true',
              'They will use the service honestly',
              'They will not use Bud Over Bills for illegal, fraudulent, or exploitative activity',
            ],
          },
          {
            heading: '5. No Guarantee',
            body: [
              'Bud Over Bills does not guarantee that users will comply with agreements.',
              'Bud Over Bills is not responsible for any damages arising from a user failing to honor a promise.',
            ],
          },
          {
            heading: '6. Limitation of Liability',
            intro: 'Bud Over Bills is not responsible for:',
            list: ['Financial losses', 'Disputes between users', 'Loss of personal relationships'],
          },
          {
            heading: '7. Service Changes',
            intro: 'Bud Over Bills reserves the right to:',
            list: ['Improve, change, or discontinue the service', 'Modify these terms without prior notice'],
          },
          { heading: '8. Governing Law', body: ['These terms are governed by the laws of Thailand.'] },
          {
            heading: '9. Contact Us',
            body: [
              <>
                If you have questions about the Terms of Use, contact us at{' '}
                <a href="mailto:support@budoverbills.com" className="text-primary hover:underline">
                  support@budoverbills.com
                </a>
              </>,
            ],
          },
        ],
        updated: 'Last updated: January 5, 2026',
      };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <Link to="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-lg font-semibold">{copy.title}</h1>
        </div>
      </header>

      <main className="p-4 pb-24 max-w-3xl mx-auto">
        <div className="space-y-6 text-foreground/80">
          {copy.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-xl font-semibold text-foreground mb-3">{section.heading}</h2>
              {section.intro ? <p className="leading-relaxed mb-3">{section.intro}</p> : null}
              {section.body?.map((line, index) => (
                <p key={index} className={`leading-relaxed ${index > 0 ? 'mt-2' : ''}`}>
                  {line}
                </p>
              ))}
              {section.list ? (
                <div className={section.heading === '3. ไม่มีการเป็นตัวกลางทางการเงิน' || section.heading === '3. No Financial Intermediation' ? 'bg-secondary/50 rounded-xl p-4 space-y-2' : ''}>
                  <ul className="list-disc pl-6 space-y-2">
                    {section.list.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  {section.footer ? (
                    <p className="text-sm text-muted-foreground pt-2 border-t border-border">{section.footer}</p>
                  ) : null}
                </div>
              ) : null}
            </section>
          ))}

          <p className="text-sm text-muted-foreground pt-4 border-t border-border">
            {copy.updated}
          </p>
        </div>
      </main>
    </div>
  );
};

export default Terms;

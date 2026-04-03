import { ArrowLeft, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageTransition } from "@/components/ux/PageTransition";
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';

const Privacy = () => {
  const { language } = useLanguage();
  const copy = language === 'th'
    ? {
        title: 'นโยบายความเป็นส่วนตัว',
        sections: [
          {
            heading: '1. ข้อมูลที่เราเก็บ',
            intro: 'Bud Over Bills อาจเก็บข้อมูล:',
            list: ['ชื่อเล่น / ชื่อที่แสดง', 'อีเมล / เบอร์โทร (ถ้ามี)', 'ข้อมูลข้อตกลงที่ผู้ใช้บันทึก', 'ข้อมูลการใช้งานแอป'],
          },
          {
            heading: '2. เราใช้ข้อมูลอย่างไร',
            intro: 'ใช้เพื่อ:',
            list: ['ให้บริการตามฟังก์ชันแอป', 'ปรับปรุงประสบการณ์ผู้ใช้', 'ติดต่อเกี่ยวกับการใช้งาน'],
          },
          {
            heading: '3. ไม่มีการเก็บข้อมูลทางการเงิน',
            intro: 'Bud Over Bills:',
            list: ['ไม่เก็บข้อมูลบัตร', 'ไม่เก็บข้อมูลบัญชีธนาคาร', 'ไม่เข้าถึงธุรกรรมการเงินจริง'],
          },
          {
            heading: '4. การแบ่งปันข้อมูล',
            intro: 'Bud Over Bills:',
            body: ['ไม่ขายข้อมูลผู้ใช้'],
            list: ['ไม่แชร์ข้อมูลกับบุคคลที่สาม ยกเว้นเพื่อการทำงานของระบบและตามที่กฎหมายกำหนด'],
          },
          {
            heading: '5. ความปลอดภัยของข้อมูล',
            highlighted: 'Bud Over Bills ใช้มาตรการที่เหมาะสมเพื่อปกป้องข้อมูล',
            note: 'แต่ไม่สามารถรับประกันความปลอดภัยได้ 100%',
          },
          {
            heading: '6. สิทธิของผู้ใช้',
            intro: 'ผู้ใช้สามารถ:',
            list: ['ขอแก้ไขข้อมูล', 'ขอให้ลบข้อมูล', 'ยุติการใช้งานได้ทุกเมื่อ'],
          },
          {
            heading: '7. การเปลี่ยนแปลงนโยบาย',
            body: ['Bud Over Bills อาจปรับปรุงนโยบายนี้เป็นครั้งคราว การใช้งานต่อถือว่ายอมรับการเปลี่ยนแปลง'],
          },
          {
            heading: '8. ติดต่อ',
            body: [
              <>
                หากมีคำถามเกี่ยวกับ Terms หรือ Privacy สามารถติดต่อได้ที่{' '}
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
        title: 'Privacy Policy',
        sections: [
          {
            heading: '1. Information We Collect',
            intro: 'Bud Over Bills may collect:',
            list: ['Nickname / display name', 'Email / phone number (if provided)', 'Agreement data recorded by the user', 'App usage data'],
          },
          {
            heading: '2. How We Use Information',
            intro: 'We use it to:',
            list: ['Provide app functionality', 'Improve the user experience', 'Contact users about usage'],
          },
          {
            heading: '3. No Financial Data Collection',
            intro: 'Bud Over Bills:',
            list: ['Does not collect card data', 'Does not collect bank account data', 'Does not access real-money transactions'],
          },
          {
            heading: '4. Data Sharing',
            intro: 'Bud Over Bills:',
            body: ['Does not sell user data'],
            list: ['Does not share data with third parties except for system operation and where required by law'],
          },
          {
            heading: '5. Data Security',
            highlighted: 'Bud Over Bills uses appropriate measures to protect data',
            note: 'but cannot guarantee 100% security.',
          },
          {
            heading: '6. User Rights',
            intro: 'Users can:',
            list: ['Request corrections', 'Request deletion', 'Stop using the service at any time'],
          },
          {
            heading: '7. Policy Changes',
            body: ['Bud Over Bills may update this policy from time to time. Continued use means you accept the changes.'],
          },
          {
            heading: '8. Contact',
            body: [
              <>
                If you have questions about the Terms or Privacy Policy, contact us at{' '}
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
    <PageTransition>
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
              {section.highlighted ? (
                <div className="bg-primary/10 rounded-xl p-4 border border-primary/20">
                  <div className="flex items-start gap-3">
                    <Shield className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="leading-relaxed font-medium text-foreground">{section.highlighted}</p>
                      <p className="text-sm text-muted-foreground mt-1">{section.note}</p>
                    </div>
                  </div>
                </div>
              ) : null}
              {section.list ? (
                <div className={section.heading === '3. ไม่มีการเก็บข้อมูลทางการเงิน' || section.heading === '3. No Financial Data Collection' || section.heading === '4. การแบ่งปันข้อมูล' || section.heading === '4. Data Sharing' ? 'bg-secondary/50 rounded-xl p-4 space-y-2' : ''}>
                  <ul className="list-disc pl-6 space-y-2">
                    {section.list.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
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
    </PageTransition>
  );
};

export default Privacy;

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export type Language = 'th' | 'en';

interface LanguageInfo {
  code: Language;
  name: string;
  nativeName: string;
  flag: string;
}

export const languages: LanguageInfo[] = [
  { code: 'th', name: 'Thai', nativeName: 'ไทย', flag: '🇹🇭' },
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
];

// Translation keys
type TranslationKeys = {
  // Common
  'common.loading': string;
  'common.error': string;
  'common.save': string;
  'common.cancel': string;
  'common.confirm': string;
  'common.back': string;
  'common.baht': string;
  'common.percent': string;
  'common.times': string;
  
  // Navigation
  'nav.feed': string;
  'nav.groups': string;
  'nav.create': string;
  'nav.calendar': string;
  'nav.profile': string;
  
  // Profile
  'profile.title': string;
  'profile.yourBadges': string;
  'profile.paidOnTime': string;
  'profile.debtClosed': string;
  'profile.newMember': string;
  'profile.totalAgreements': string;
  'profile.closedSuccess': string;
  'profile.notifications': string;
  'profile.privacy': string;
  'profile.badges': string;
  'profile.history': string;
  'profile.help': string;
  'profile.settings': string;
  'profile.logout': string;
  'profile.logoutSuccess': string;
  'profile.featureInDev': string;
  'profile.language': string;
  'profile.selectLanguage': string;
  
  // Friends
  'friends.title': string;
  'friends.count': string;
  'friends.searchPlaceholder': string;
  'friends.noResults': string;
  'friends.clearSearch': string;
  'friends.noFriends': string;
  'friends.addFirstHint': string;
  'friends.addFirst': string;
  'friends.addNew': string;
  'friends.name': string;
  'friends.namePlaceholder': string;
  'friends.phone': string;
  'friends.phonePlaceholder': string;
  'friends.add': string;
  'friends.nameRequired': string;
  'friends.addSuccess': string;
  'friends.deleteSuccess': string;
  'friends.updateSuccess': string;
  'friends.deleteConfirmTitle': string;
  'friends.deleteConfirmDesc': string;
  'friends.delete': string;
  
  // Create Agreement
  'create.title': string;
  'create.youAre': string;
  'create.lender': string;
  'create.borrower': string;
  'create.friendInfo': string;
  'create.friendName': string;
  'create.friendPhone': string;
  'create.loanAmount': string;
  'create.interest': string;
  'create.interestRate': string;
  'create.noInterest': string;
  'create.flatRate': string;
  'create.effectiveRate': string;
  'create.installments': string;
  'create.paymentFrequency': string;
  'create.daily': string;
  'create.weekly': string;
  'create.monthly': string;
  'create.dueDate': string;
  'create.notes': string;
  'create.paymentSummary': string;
  'create.principal': string;
  'create.interestPercent': string;
  'create.interestAmount': string;
  'create.paymentCount': string;
  'create.submitRequest': string;
  'create.calculationSummary': string;
  'create.totalInterest': string;
  'create.perInstallment': string;
  'create.compareAll': string;

  // PWA Install Prompt
  'pwa.closeLabel': string;
  'pwa.title': string;
  'pwa.description': string;
  'pwa.note': string;
  'pwa.iosHint': string;
  'pwa.iosAction': string;
  'pwa.installLabel': string;
  'pwa.installButton': string;
};

type Translations = Record<Language, TranslationKeys>;

const translations: Translations = {
  th: {
    'common.loading': 'กำลังโหลด...',
    'common.error': 'เกิดข้อผิดพลาด',
    'common.save': 'บันทึก',
    'common.cancel': 'ยกเลิก',
    'common.confirm': 'ยืนยัน',
    'common.back': 'กลับ',
    'common.baht': 'บาท',
    'common.percent': '%',
    'common.times': 'ครั้ง',
    'nav.feed': 'พัฒนาการเงิน',
    'nav.groups': 'แชร์บิล',
    'nav.create': 'สร้าง',
    'nav.calendar': 'ปฏิทินชำระ',
    'nav.profile': 'โปรไฟล์',
    'profile.title': 'โปรไฟล์',
    'profile.yourBadges': 'เหรียญของคุณ',
    'profile.paidOnTime': 'จ่ายตรงเวลา',
    'profile.debtClosed': 'ปิดหนี้สำเร็จ',
    'profile.newMember': 'สมาชิกใหม่',
    'profile.totalAgreements': 'ข้อตกลงทั้งหมด',
    'profile.closedSuccess': 'ปิดสำเร็จ',
    'profile.notifications': 'การแจ้งเตือน',
    'profile.privacy': 'ความเป็นส่วนตัว',
    'profile.badges': 'เหรียญรางวัล',
    'profile.history': 'ประวัติข้อตกลง',
    'profile.help': 'ช่วยเหลือ',
    'profile.settings': 'ตั้งค่า',
    'profile.logout': 'ออกจากระบบ',
    'profile.logoutSuccess': 'ออกจากระบบแล้ว',
    'profile.featureInDev': 'ฟีเจอร์นี้กำลังพัฒนา',
    'profile.language': 'ภาษา',
    'profile.selectLanguage': 'เลือกภาษา',
    'friends.title': 'เพื่อน',
    'friends.count': 'คน',
    'friends.searchPlaceholder': 'ค้นหาเพื่อน...',
    'friends.noResults': 'ไม่พบเพื่อนที่ค้นหา',
    'friends.clearSearch': 'ล้างการค้นหา',
    'friends.noFriends': 'ยังไม่มีเพื่อน',
    'friends.addFirstHint': 'เพิ่มเพื่อนเพื่อเริ่มแชร์บิลหรือสร้างข้อตกลง',
    'friends.addFirst': 'เพิ่มเพื่อนคนแรก',
    'friends.addNew': 'เพิ่มเพื่อนใหม่',
    'friends.name': 'ชื่อ',
    'friends.namePlaceholder': 'ชื่อเพื่อน',
    'friends.phone': 'เบอร์โทร (ไม่บังคับ)',
    'friends.phonePlaceholder': '08X-XXX-XXXX',
    'friends.add': 'เพิ่มเพื่อน',
    'friends.nameRequired': 'กรุณาใส่ชื่อเพื่อน',
    'friends.addSuccess': 'เพิ่มเพื่อนสำเร็จ',
    'friends.deleteSuccess': 'ลบเพื่อนแล้ว',
    'friends.updateSuccess': 'อัพเดทข้อมูลแล้ว',
    'friends.deleteConfirmTitle': 'ลบเพื่อน?',
    'friends.deleteConfirmDesc': 'การลบเพื่อนจะไม่ส่งผลกระทบต่อข้อตกลงหรือกลุ่มที่มีอยู่',
    'friends.delete': 'ลบ',
    'create.title': 'สร้างข้อตกลงใหม่',
    'create.youAre': 'คุณเป็น',
    'create.lender': 'ผู้ให้ยืม',
    'create.borrower': 'ผู้ยืม',
    'create.friendInfo': 'ข้อมูลเพื่อน',
    'create.friendName': 'ชื่อเพื่อน',
    'create.friendPhone': 'เบอร์โทร',
    'create.loanAmount': 'จำนวนเงิน',
    'create.interest': 'ดอกเบี้ย',
    'create.interestRate': 'อัตราดอกเบี้ย',
    'create.noInterest': 'ไม่คิดดอก',
    'create.flatRate': 'เงินต้นคงที่',
    'create.effectiveRate': 'ลดต้นลดดอก',
    'create.installments': 'จำนวนงวด',
    'create.paymentFrequency': 'ความถี่ในการชำระ',
    'create.daily': 'รายวัน',
    'create.weekly': 'รายสัปดาห์',
    'create.monthly': 'รายเดือน',
    'create.dueDate': 'วันครบกำหนด',
    'create.notes': 'หมายเหตุ',
    'create.paymentSummary': 'สรุปการชำระเงิน',
    'create.principal': 'เงินยืม',
    'create.interestPercent': '% ดอกเบี้ย',
    'create.interestAmount': 'ค่าดอกเบี้ย',
    'create.paymentCount': 'จำนวนครั้งที่ชำระ',
    'create.submitRequest': 'ส่งคำขอข้อตกลง',
    'create.calculationSummary': 'สรุปการคำนวณ',
    'create.totalInterest': 'ดอกเบี้ยรวม',
    'create.perInstallment': 'ชำระครั้งละ',
    'create.compareAll': 'เปรียบเทียบทุกแบบ',
    'pwa.closeLabel': 'ปิดคำแนะนำการติดตั้งแอป',
    'pwa.title': 'ติดตั้งแอป BOB',
    'pwa.description': 'เข้าถึงได้เร็วขึ้นจากหน้าจอหลัก และบางหน้าจะเปิดได้เร็วขึ้นจากแคชเมื่อเคยใช้งานแล้ว',
    'pwa.note': 'ข้อมูลสดและการทำรายการส่วนใหญ่ยังต้องต่อเน็ต',
    'pwa.iosHint': 'แตะปุ่มแชร์ แล้วเลือก',
    'pwa.iosAction': '"เพิ่มไปยังหน้าจอหลัก"',
    'pwa.installLabel': 'ติดตั้งแอป BOB',
    'pwa.installButton': 'ติดตั้งแอป',
  },
  en: {
    'common.loading': 'Loading...',
    'common.error': 'Error',
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.confirm': 'Confirm',
    'common.back': 'Back',
    'common.baht': 'Baht',
    'common.percent': '%',
    'common.times': 'times',
    'nav.feed': 'Feed',
    'nav.groups': 'Groups',
    'nav.create': 'Create',
    'nav.calendar': 'Calendar',
    'nav.profile': 'Profile',
    'profile.title': 'Profile',
    'profile.yourBadges': 'Your Badges',
    'profile.paidOnTime': 'Paid on Time',
    'profile.debtClosed': 'Debt Closed',
    'profile.newMember': 'New Member',
    'profile.totalAgreements': 'Total Agreements',
    'profile.closedSuccess': 'Closed',
    'profile.notifications': 'Notifications',
    'profile.privacy': 'Privacy',
    'profile.badges': 'Badges',
    'profile.history': 'History',
    'profile.help': 'Help',
    'profile.settings': 'Settings',
    'profile.logout': 'Logout',
    'profile.logoutSuccess': 'Logged out',
    'profile.featureInDev': 'Feature in development',
    'profile.language': 'Language',
    'profile.selectLanguage': 'Select Language',
    'friends.title': 'Friends',
    'friends.count': 'friends',
    'friends.searchPlaceholder': 'Search friends...',
    'friends.noResults': 'No friends found',
    'friends.clearSearch': 'Clear search',
    'friends.noFriends': 'No friends yet',
    'friends.addFirstHint': 'Add friends to share bills or create agreements',
    'friends.addFirst': 'Add first friend',
    'friends.addNew': 'Add new friend',
    'friends.name': 'Name',
    'friends.namePlaceholder': 'Friend name',
    'friends.phone': 'Phone (optional)',
    'friends.phonePlaceholder': '08X-XXX-XXXX',
    'friends.add': 'Add friend',
    'friends.nameRequired': 'Please enter friend name',
    'friends.addSuccess': 'Friend added',
    'friends.deleteSuccess': 'Friend removed',
    'friends.updateSuccess': 'Friend updated',
    'friends.deleteConfirmTitle': 'Remove friend?',
    'friends.deleteConfirmDesc': 'This will not affect existing agreements or groups',
    'friends.delete': 'Remove',
    'create.title': 'Create Agreement',
    'create.youAre': 'You are',
    'create.lender': 'Lender',
    'create.borrower': 'Borrower',
    'create.friendInfo': 'Friend Info',
    'create.friendName': 'Friend Name',
    'create.friendPhone': 'Phone',
    'create.loanAmount': 'Amount',
    'create.interest': 'Interest',
    'create.interestRate': 'Interest Rate',
    'create.noInterest': 'No Interest',
    'create.flatRate': 'Flat Rate',
    'create.effectiveRate': 'Effective Rate',
    'create.installments': 'Installments',
    'create.paymentFrequency': 'Frequency',
    'create.daily': 'Daily',
    'create.weekly': 'Weekly',
    'create.monthly': 'Monthly',
    'create.dueDate': 'Due Date',
    'create.notes': 'Notes',
    'create.paymentSummary': 'Payment Summary',
    'create.principal': 'Principal',
    'create.interestPercent': 'Interest %',
    'create.interestAmount': 'Interest Amount',
    'create.paymentCount': 'Payment Count',
    'create.submitRequest': 'Send Agreement Request',
    'create.calculationSummary': 'Calculation Summary',
    'create.totalInterest': 'Total Interest',
    'create.perInstallment': 'Per Installment',
    'create.compareAll': 'Compare All',
    'pwa.closeLabel': 'Close install app prompt',
    'pwa.title': 'Install BOB',
    'pwa.description': 'Open it faster from your home screen, and some pages may load faster from cache after you\'ve used them.',
    'pwa.note': 'Live data and most actions still require an internet connection.',
    'pwa.iosHint': 'Tap the share button, then choose',
    'pwa.iosAction': '"Add to Home Screen"',
    'pwa.installLabel': 'Install BOB',
    'pwa.installButton': 'Install app',
  },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: keyof TranslationKeys) => string;
  currentLanguage: LanguageInfo;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const LANGUAGE_STORAGE_KEY = 'app-language';
const FALLBACK_LANGUAGE: Language = 'th';

function isLanguage(value: string | null): value is Language {
  return value !== null && languages.some((language) => language.code === value);
}

function detectBrowserLanguage(): Language | null {
  if (typeof navigator === 'undefined') {
    return null;
  }

  const candidates = [
    ...(navigator.languages || []),
    navigator.language,
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const normalized = candidate.toLowerCase().replace('_', '-');
    const exactMatch = languages.find((language) => language.code === normalized);
    if (exactMatch) {
      return exactMatch.code;
    }

    const baseLanguage = normalized.split('-')[0];
    const baseMatch = languages.find((language) => language.code === baseLanguage);
    if (baseMatch) {
      return baseMatch.code;
    }
  }

  return null;
}

function getInitialLanguage(): Language {
  if (typeof window === 'undefined') {
    return FALLBACK_LANGUAGE;
  }

  const storedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (isLanguage(storedLanguage)) {
    return storedLanguage;
  }

  const browserLanguage = detectBrowserLanguage();
  if (browserLanguage) {
    return browserLanguage;
  }

  return FALLBACK_LANGUAGE;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getInitialLanguage);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  };

  const t = (key: keyof TranslationKeys): string => {
    return translations[language]?.[key] || translations[FALLBACK_LANGUAGE][key] || key;
  };

  const currentLanguage = languages.find((l) => l.code === language) || languages[0];

  useEffect(() => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, currentLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}

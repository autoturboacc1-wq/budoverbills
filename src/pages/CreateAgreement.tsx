import { motion } from "framer-motion";
import { PageTransition } from "@/components/ux/PageTransition";
import { ArrowLeft, ArrowRight, Send, User, Calendar, Percent, Calculator, Info, AlertTriangle, Coins, Building, CheckCircle, Loader2, Scan, Link as LinkIcon } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useLocation, useNavigate } from "react-router-dom";
import { useState, useMemo, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useDebtAgreements, CreateAgreementInput } from "@/hooks/useDebtAgreements";
import { useAuth } from "@/contexts/AuthContext";
import { PasswordConfirmDialog } from "@/components/PasswordConfirmDialog";
import { QRCodeScanner } from "@/components/QRCodeScanner";
import { supabase } from "@/integrations/supabase/client";
import { THAI_BANKS } from "@/constants/thaibanks";
import { buildEffectiveRateSchedule, getPeriodsPerYear } from "@/domains/debt/recalculateEffectiveRateSchedule";
import { divideMoney, roundMoney, sumMoney, toMoney } from "@/utils/money";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  InlineValidationMessage,
  PageHeader,
  PrimaryActionBar,
  ReviewPanel,
  StepFlowLayout,
} from "@/components/ux";

type InterestType = "none" | "flat" | "effective";

interface CalculationResult {
  perInstallment: number;
  totalInterest: number;
  totalAmount: number;
  schedule: { installment: number; principal: number; interest: number; total: number }[];
}

interface PaymentScheduleItem {
  installment: number;
  date: Date;
  amount: number;
  principal: number;
  interest: number;
}

interface BorrowerProfile {
  user_id: string;
  display_name: string | null;
  user_code: string;
}

const BANGKOK_TIME_ZONE = "Asia/Bangkok";
const BORROWER_CODE_LENGTH = 8;
const bangkokDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BANGKOK_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const formatBangkokDate = (date: Date) => {
  const parts = bangkokDateFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";

  return `${year}-${month}-${day}`;
};

const parseBangkokDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const [, year, month, day] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
};

const getBangkokTodayDate = () => parseBangkokDate(formatBangkokDate(new Date())) ?? new Date();

const addBangkokDays = (date: Date, days: number) => {
  const nextDate = new Date(date.getTime());
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
};

const addBangkokMonths = (date: Date, months: number) => {
  const nextDate = new Date(date.getTime());
  nextDate.setUTCMonth(nextDate.getUTCMonth() + months);
  return nextDate;
};

const normalizeBorrowerCode = (value: string) =>
  value.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, BORROWER_CODE_LENGTH);

const extractBorrowerCodeFromQr = (decodedText: string) => {
  const trimmed = decodedText.trim();
  const appLinkMatch = trimmed.match(/debtmate:\/\/add-friend\/([A-Z0-9]{8})/i);
  if (appLinkMatch?.[1]) {
    return normalizeBorrowerCode(appLinkMatch[1]);
  }

  return /^[A-Z0-9]{8}$/i.test(trimmed) ? normalizeBorrowerCode(trimmed) : null;
};

const createInvitationToken = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

export default function CreateAgreement() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { createAgreement } = useDebtAgreements();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [showBorrowerScanner, setShowBorrowerScanner] = useState(false);
  const [borrowerProfile, setBorrowerProfile] = useState<BorrowerProfile | null>(null);
  const [borrowerCodeError, setBorrowerCodeError] = useState<string | null>(null);
  const [isResolvingBorrower, setIsResolvingBorrower] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  
  const [formData, setFormData] = useState({
    partnerCode: "",
    partnerName: "",
    amount: "",
    installments: "4",
    frequency: "monthly",
    interest: "",
    interestType: "none" as InterestType,
    startDate: formatBangkokDate(new Date()),
    weeklyDay: "1", // 0=อาทิตย์, 1=จันทร์, ..., 6=เสาร์
    rescheduleFeeRate: "5", // Default 5% for reschedule fee (no-interest)
    rescheduleInterestPercent: "100", // Default 100% - pay full interest portion of that installment
    bankName: "",
    accountNumber: "",
    accountName: "",
  });

  useEffect(() => {
    const state = location.state as { partnerName?: string; partnerCode?: string } | null;
    if (!state?.partnerName && !state?.partnerCode) return;

    setFormData((prev) => ({
      ...prev,
      partnerName: prev.partnerName || state.partnerName || "",
      partnerCode: prev.partnerCode || normalizeBorrowerCode(state.partnerCode || ""),
    }));
  }, [location.state]);

  const lookupBorrowerByCode = useCallback(async (code: string) => {
    const { data, error } = await supabase.rpc("search_profile_by_code", {
      search_code: normalizeBorrowerCode(code),
    });

    if (error) {
      throw error;
    }

    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }

    return data[0] as BorrowerProfile;
  }, []);

  const handleBorrowerQrScanned = useCallback((decodedText: string) => {
    const code = extractBorrowerCodeFromQr(decodedText);
    if (!code) {
      toast.error("QR code ไม่ถูกต้อง");
      return;
    }

    setFormData((prev) => ({ ...prev, partnerCode: code }));
  }, []);

  useEffect(() => {
    const code = normalizeBorrowerCode(formData.partnerCode);

    if (!code) {
      setBorrowerProfile(null);
      setBorrowerCodeError(null);
      setIsResolvingBorrower(false);
      return;
    }

    if (code.length < BORROWER_CODE_LENGTH) {
      setBorrowerProfile(null);
      setBorrowerCodeError(null);
      setIsResolvingBorrower(false);
      return;
    }

    let cancelled = false;
    setIsResolvingBorrower(true);
    setBorrowerCodeError(null);

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const profile = await lookupBorrowerByCode(code);

          if (cancelled) {
            return;
          }

          if (!profile) {
            setBorrowerProfile(null);
            setBorrowerCodeError("ไม่พบผู้ใช้รหัสนี้");
            return;
          }

          setBorrowerProfile(profile);
          setFormData((prev) => ({
            ...prev,
            partnerName: prev.partnerName || profile.display_name || `User ${profile.user_code}`,
          }));
        } catch (error) {
          if (!cancelled) {
            console.error("Borrower code lookup error:", error);
            setBorrowerProfile(null);
            setBorrowerCodeError("ตรวจสอบรหัสผู้ยืมไม่สำเร็จ");
          }
        } finally {
          if (!cancelled) {
            setIsResolvingBorrower(false);
          }
        }
      })();
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [formData.partnerCode, lookupBorrowerByCode]);

  // Fetch bank account from previous agreements
  useEffect(() => {
    const fetchBankAccount = async () => {
      if (!user?.id) return;
      
      const { data: agreement } = await supabase
        .from("debt_agreements")
        .select("bank_name, account_number, account_name")
        .eq("lender_id", user.id)
        .not("bank_name", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (agreement && agreement.bank_name) {
        setFormData(prev => ({
          ...prev,
          bankName: agreement.bank_name || "",
          accountNumber: agreement.account_number || "",
          accountName: agreement.account_name || "",
        }));
      }
    };
    
    fetchBankAccount();
  }, [user?.id]);

  const THAI_DAY_NAMES = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

  const principalAmount = useMemo(() => {
    try {
      return toMoney(formData.amount || 0);
    } catch {
      return 0;
    }
  }, [formData.amount]);

  const installmentCount = useMemo(() => {
    const parsed = Number.parseInt(formData.installments, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  }, [formData.installments]);

  const annualInterestRate = useMemo(() => {
    try {
      return Math.min(toMoney(formData.interest || 0), 15);
    } catch {
      return 0;
    }
  }, [formData.interest]);

  const principalPerInstallment = useMemo(() => {
    return divideMoney(Math.max(principalAmount, 0), installmentCount);
  }, [principalAmount, installmentCount]);

  // Validate form before showing password dialog
  const handleSubmitClick = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      toast.error("กรุณาเข้าสู่ระบบก่อน");
      navigate("/auth");
      return;
    }

    // For pay-per-agreement model, we always allow but may need payment
    // The actual payment logic will be handled separately

    if (!formData.amount || principalAmount <= 0) {
      toast.error("กรุณาใส่จำนวนเงิน");
      return;
    }

    if (!formData.partnerName.trim()) {
      toast.error("กรุณาระบุชื่อผู้ยืม");
      return;
    }

    const borrowerCode = normalizeBorrowerCode(formData.partnerCode);
    if (borrowerCode && borrowerCode.length !== BORROWER_CODE_LENGTH) {
      toast.error("รหัสผู้ยืมต้องมี 8 ตัวอักษร");
      return;
    }

    if (isResolvingBorrower) {
      toast.error("กรุณารอระบบตรวจสอบรหัสผู้ยืม");
      return;
    }

    if (borrowerCode && !borrowerProfile) {
      toast.error(borrowerCodeError || "ไม่พบผู้ใช้รหัสนี้");
      return;
    }

    // Show password confirmation dialog
    setShowPasswordConfirm(true);
  };

  // Actually submit after password verification
  const handleConfirmedSubmit = async () => {
    setIsSubmitting(true);

    try {
      const invitationToken = borrowerProfile ? undefined : createInvitationToken();
      const input: CreateAgreementInput = {
        borrower_id: borrowerProfile?.user_id,
        borrower_phone: undefined,
        borrower_name: formData.partnerName.trim() || undefined,
        invitation_token: invitationToken,
        principal_amount: principalAmount,
        interest_rate: annualInterestRate,
        interest_type: formData.interestType,
        total_amount: selectedCalculation?.totalAmount || principalAmount,
        num_installments: installmentCount,
        frequency: formData.frequency as 'daily' | 'weekly' | 'monthly',
        start_date: formData.startDate,
        reschedule_fee_rate: formData.interestType === 'none'
          ? toMoney(formData.rescheduleFeeRate || 0)
          : toMoney(formData.rescheduleInterestPercent || 0),
        reschedule_interest_multiplier: undefined, // No longer using multiplier
        bank_name: formData.bankName,
        account_number: formData.accountNumber,
        account_name: formData.accountName,
        installments: paymentSchedule.map(item => ({
          installment_number: item.installment,
          due_date: formatBangkokDate(item.date),
          amount: item.amount,
          principal_portion: item.principal,
          interest_portion: item.interest,
        })),
      };

      const result = await createAgreement(input);

      if (result) {
        if (invitationToken) {
          const inviteUrl = `${window.location.origin}/agreement/invite/${invitationToken}`;
          try {
            await navigator.clipboard.writeText(inviteUrl);
            toast.success("สร้างข้อตกลงและคัดลอกลิงก์เชิญแล้ว", {
              description: "ส่งลิงก์นี้ให้ผู้ยืมเพื่อผูกบัญชีและยืนยันข้อตกลง",
            });
          } catch {
            toast.success("สร้างข้อตกลงสำเร็จ", {
              description: inviteUrl,
            });
          }
        } else {
          toast.success("ส่งคำขอให้ผู้ยืมยืนยันสำเร็จ");
        }
        navigate("/");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.toLowerCase().includes('quota exceeded')) {
        toast.error("ไม่สามารถสร้างข้อตกลงได้ในขณะนี้");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Calculate installments based on interest type
  const calculations = useMemo((): Record<InterestType, CalculationResult | null> => {
    const principal = principalAmount;
    const numInstallments = installmentCount;
    const annualRate = annualInterestRate / 100;

    if (principal <= 0) {
      return { none: null, flat: null, effective: null };
    }

    // Calculate period rate based on frequency
    const periodsPerYear = getPeriodsPerYear(formData.frequency as 'daily' | 'weekly' | 'monthly');

    const periodRate = annualRate / periodsPerYear;

    // No interest calculation
    const noInterestPerInstallment = divideMoney(principal, numInstallments);
    const noInterest: CalculationResult = {
      perInstallment: noInterestPerInstallment,
      totalInterest: 0,
      totalAmount: principal,
      schedule: [],
    };

    // Flat Rate: Fixed interest on original principal
    const totalFlatInterest = roundMoney(principal * annualRate * (numInstallments / periodsPerYear));
    const flatTotal = sumMoney(principal, totalFlatInterest);
    const flatPerInstallment = divideMoney(flatTotal, numInstallments);
    const flatInterestPerInstallment = divideMoney(totalFlatInterest, numInstallments);
    const flatPrincipalPerInstallment = divideMoney(principal, numInstallments);
    
    // Generate flat rate schedule
    const flatSchedule: CalculationResult["schedule"] = [];
    for (let i = 1; i <= numInstallments; i++) {
      flatSchedule.push({
        installment: i,
        principal: flatPrincipalPerInstallment,
        interest: flatInterestPerInstallment,
        total: sumMoney(flatPrincipalPerInstallment, flatInterestPerInstallment),
      });
    }
    
    const flat: CalculationResult = {
      perInstallment: flatPerInstallment,
      totalInterest: totalFlatInterest,
      totalAmount: flatTotal,
      schedule: flatSchedule,
    };

    // Effective Rate (Reducing Balance): Interest calculated on remaining principal
    const effectiveSchedule = buildEffectiveRateSchedule({
      principal,
      annualRatePercent: annualInterestRate,
      installments: numInstallments,
      frequency: formData.frequency as 'daily' | 'weekly' | 'monthly',
    });
    const totalEffectiveInterest = sumMoney(...effectiveSchedule.map((item) => item.interest));

    const effective: CalculationResult = {
      perInstallment:
        effectiveSchedule.length > 0 ? effectiveSchedule[0].total : divideMoney(principal, numInstallments),
      totalInterest: totalEffectiveInterest,
      totalAmount: sumMoney(principal, totalEffectiveInterest),
      schedule: effectiveSchedule,
    };

    return {
      none: noInterest,
      flat,
      effective,
    };
  }, [annualInterestRate, formData.frequency, installmentCount, principalAmount]);

  const selectedCalculation = calculations[formData.interestType];

  // Calculate annual reschedule fee rate and check against 15% ceiling
  const rescheduleFeeAnalysis = useMemo(() => {
    const principal = principalAmount;
    const numInstallments = installmentCount;
    const currentInterestRate = annualInterestRate;
    
    if (formData.interestType !== 'none') {
      // For interest-bearing agreements, fee = pay interest portion upfront (1-100%)
      // This is NOT extra interest - it's "ตัดดอกก่อน" (pay interest first)
      const interestPerInstallment = selectedCalculation?.schedule?.[0]?.interest || 0;
      const interestPercent = Number(formData.rescheduleInterestPercent) || 100;
      const feePerRequest = roundMoney((interestPerInstallment * interestPercent) / 100);
      
      // Since this is paying interest early (not adding extra), 
      // the 15% ceiling is already covered by the interest rate itself.
      // However, we still show the fee calculation for transparency.
      return {
        feePerRequest,
        interestPerInstallment,
        interestPercent,
        // No extra annual rate since it's just prepaying existing interest
        annualRateIfRescheduleEveryMonth: currentInterestRate, // stays the same
        isNearCeiling: false, // Not applicable - prepaying doesn't add cost
        isOverCeiling: false,
        currentAnnualRate: currentInterestRate,
        feeType: 'prepay_interest' as const,
      };
    }
    
    // For no-interest agreements, calculate potential annual rate
    const feeRate = Number(formData.rescheduleFeeRate) || 5;
    const feePerRequest = roundMoney((principalPerInstallment * feeRate) / 100);
    
    // More realistic: assume borrower reschedules once per original installment
    const rescheduleFrequencyMultiplier = formData.frequency === 'daily' ? 365 : 
                                           formData.frequency === 'weekly' ? 52 : 12;
    const theoreticalMaxReschedules = Math.min(numInstallments, rescheduleFrequencyMultiplier);
    const realisticAnnualFee = principal > 0 ? (feePerRequest * theoreticalMaxReschedules) / principal * 100 : 0;
    
    return {
      feePerRequest,
      feeRate,
      annualRateIfRescheduleEveryMonth: realisticAnnualFee,
      isNearCeiling: realisticAnnualFee >= 10 && realisticAnnualFee < 15,
      isOverCeiling: realisticAnnualFee >= 15,
      maxSafeRate: Math.max(1, Math.floor((15 * principal) / (feePerRequest > 0 ? feePerRequest * theoreticalMaxReschedules : 1))),
      currentAnnualRate: 0,
      feeType: 'percentage' as const,
    };
  }, [annualInterestRate, formData.frequency, formData.interestType, formData.rescheduleFeeRate, formData.rescheduleInterestPercent, installmentCount, principalAmount, principalPerInstallment, selectedCalculation]);

  const interestTypeLabels: Record<InterestType, { title: string; desc: string }> = {
    none: { title: "ไม่มีดอก", desc: "จ่ายเท่ากัน" },
    flat: { title: "Flat", desc: "ดอกคงที่" },
    effective: { title: "Effective", desc: "ลดต้นลดดอก" },
  };

  // Generate payment schedule dates
  const paymentSchedule = useMemo<PaymentScheduleItem[]>(() => {
    if (!selectedCalculation) return [];
    
    const numInstallments = installmentCount;
    const schedule: PaymentScheduleItem[] = [];
    
    // For weekly: calculate from selected day of week
    if (formData.frequency === "weekly") {
      const targetDay = Number(formData.weeklyDay);
      const current = parseBangkokDate(formData.startDate) ?? getBangkokTodayDate();
      
      // Find the first occurrence of targetDay from the selected Bangkok start date.
      while (current.getUTCDay() !== targetDay) {
        current.setUTCDate(current.getUTCDate() + 1);
      }
      
      for (let i = 0; i < numInstallments; i++) {
        const paymentDate = addBangkokDays(current, i * 7);
        
        const calcSchedule = selectedCalculation.schedule[i];
        schedule.push({
          installment: i + 1,
          date: paymentDate,
          amount: calcSchedule?.total || selectedCalculation.perInstallment,
          principal: calcSchedule?.principal || principalPerInstallment,
          interest: calcSchedule?.interest || 0,
        });
      }
    } else {
      // Daily or Monthly
      const startDate = parseBangkokDate(formData.startDate) ?? getBangkokTodayDate();
      
      for (let i = 0; i < numInstallments; i++) {
        if (formData.frequency === "daily") {
          const paymentDate = addBangkokDays(startDate, i);
          const calcSchedule = selectedCalculation.schedule[i];
          schedule.push({
            installment: i + 1,
            date: paymentDate,
            amount: calcSchedule?.total || selectedCalculation.perInstallment,
            principal: calcSchedule?.principal || principalPerInstallment,
            interest: calcSchedule?.interest || 0,
          });
        } else {
          const paymentDate = addBangkokMonths(startDate, i);
          const calcSchedule = selectedCalculation.schedule[i];
          schedule.push({
            installment: i + 1,
            date: paymentDate,
            amount: calcSchedule?.total || selectedCalculation.perInstallment,
            principal: calcSchedule?.principal || principalPerInstallment,
            interest: calcSchedule?.interest || 0,
          });
        }
      }
    }
    
    return schedule;
  }, [formData.frequency, formData.startDate, formData.weeklyDay, installmentCount, principalPerInstallment, selectedCalculation]);

  const frequencyLabels: Record<string, string> = {
    daily: "รายวัน",
    weekly: "รายสัปดาห์",
    monthly: "รายเดือน",
  };

  const borrowerCode = normalizeBorrowerCode(formData.partnerCode);
  const hasBorrowerCode = borrowerCode.length > 0;
  const isBorrowerCodeComplete = borrowerCode.length === BORROWER_CODE_LENGTH;
  const canUseBorrowerCode =
    !hasBorrowerCode || (isBorrowerCodeComplete && Boolean(borrowerProfile) && !borrowerCodeError);

  const stepDefinitions = [
    { title: "ผู้ยืม", description: "ชื่อและรหัส" },
    { title: "ยอดเงิน", description: "เงิน งวด ดอก" },
    { title: "บัญชี", description: "รับเงินคืน" },
    { title: "ตรวจสอบ", description: "Review all" },
  ];

  const canProceedByStep = [
    !!formData.partnerName.trim() && canUseBorrowerCode && !isResolvingBorrower,
    !!formData.amount && principalAmount > 0 && installmentCount > 0 && !!selectedCalculation,
    !!formData.bankName && !!formData.accountNumber,
    !!selectedCalculation && !!formData.partnerName.trim() && canUseBorrowerCode && !isResolvingBorrower && !!formData.amount && !!formData.bankName && !!formData.accountNumber,
  ];

  const selectedBankLabel =
    THAI_BANKS.find((bank) => bank.value === formData.bankName)?.label || formData.bankName || "ยังไม่ได้เลือก";

  const reviewRows = selectedCalculation
    ? [
        { label: "ผู้ยืม", value: formData.partnerName || "-" },
        {
          label: "การผูกบัญชีผู้ยืม",
          value: borrowerProfile ? `รหัส ${borrowerProfile.user_code}` : "ลิงก์เชิญให้มายืนยัน",
        },
        { label: "เงินต้น", value: `฿${principalAmount.toLocaleString()}` },
        {
          label: "โครงสร้างดอกเบี้ย",
          value:
            formData.interestType === "none"
              ? "ไม่คิดดอกเบี้ย"
              : `${interestTypeLabels[formData.interestType].title} ${annualInterestRate.toLocaleString()}% ต่อปี`,
        },
        {
          label: "แผนการชำระ",
          value: `${installmentCount} งวด / ${frequencyLabels[formData.frequency]}`,
          hint:
            formData.frequency === "weekly"
              ? `ทุกวัน${THAI_DAY_NAMES[Number(formData.weeklyDay)]}`
              : `เริ่ม ${parseBangkokDate(formData.startDate)?.toLocaleDateString("th-TH") || formData.startDate}`,
        },
        { label: "ชำระต่องวด", value: `฿${selectedCalculation.perInstallment.toLocaleString()}` },
        { label: "ยอดรวมทั้งหมด", value: `฿${selectedCalculation.totalAmount.toLocaleString()}` },
        {
          label: "ค่าเลื่อนงวด",
          value: `฿${rescheduleFeeAnalysis.feePerRequest.toLocaleString()}/ครั้ง`,
        },
        { label: "บัญชีรับเงิน", value: selectedBankLabel },
        { label: "เลขบัญชี/PromptPay", value: formData.accountNumber || "-" },
        { label: "ชื่อบัญชี", value: formData.accountName || "-" },
      ]
    : [];

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentStep]);

  return (
    <PageTransition>
    <div className="min-h-screen">
      <div className="page-shell">
        <PageHeader
          eyebrow="สำหรับผู้ให้ยืม"
          title="สร้างข้อตกลง"
          description="กรอกข้อมูล แล้วส่งให้ผู้ยืมยืนยัน"
          onBack={() => navigate(-1)}
        />

        <StepFlowLayout
          title="รายละเอียดข้อตกลง"
          currentStep={currentStep}
          steps={stepDefinitions}
        >
          <motion.form
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            onSubmit={handleSubmitClick}
            className="space-y-6"
          >
          {currentStep === 0 && (
            <motion.div
              key="borrower-step"
              id="agreement-step-0"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4 rounded-[1.25rem] border border-primary/25 bg-primary/[0.03] p-5 transition-all"
            >
              <div className="flex items-center gap-2 text-foreground font-medium">
                <User className="w-5 h-5 text-primary" />
                <span>ผู้ยืม (ผู้รับเงินไป)</span>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="partnerName">ชื่อผู้ยืม</Label>
                  <Input
                    id="partnerName"
                    placeholder="เช่น สมชาย ใจดี"
                    value={formData.partnerName}
                    onChange={(e) => setFormData({ ...formData, partnerName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="partnerCode">รหัสผู้ใช้ผู้ยืม (ไม่บังคับ)</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 px-2 text-xs"
                      onClick={() => setShowBorrowerScanner(true)}
                    >
                      <Scan className="h-3.5 w-3.5" aria-hidden="true" />
                      สแกน QR
                    </Button>
                  </div>
                  <div className="relative">
                    <Input
                      id="partnerCode"
                      inputMode="text"
                      autoCapitalize="characters"
                      placeholder="ABC12345"
                      value={formData.partnerCode}
                      onChange={(e) =>
                        setFormData({ ...formData, partnerCode: normalizeBorrowerCode(e.target.value) })
                      }
                      className="pr-10 font-mono uppercase tracking-wider"
                      maxLength={BORROWER_CODE_LENGTH}
                    />
                    {isResolvingBorrower ? (
                      <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                    ) : borrowerProfile ? (
                      <CheckCircle className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-status-paid" />
                    ) : null}
                  </div>
                </div>
              </div>

              {borrowerCodeError ? (
                <InlineValidationMessage tone="warning" message={borrowerCodeError} />
              ) : borrowerProfile ? (
                <InlineValidationMessage
                  tone="success"
                  message={`พบผู้ยืม: ${borrowerProfile.display_name || `User ${borrowerProfile.user_code}`} ระบบจะผูก borrower_id ทันที`}
                />
              ) : (
                <div className="flex items-start gap-2 rounded-xl border border-border/70 bg-background/70 p-3 text-xs text-muted-foreground">
                  <LinkIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <p>
                    ถ้าไม่มีรหัสผู้ใช้ เวลาสร้างเสร็จระบบจะสร้างลิงก์เชิญให้ผู้ยืมกดผูกบัญชีและยืนยันเอง
                  </p>
                </div>
              )}
            </motion.div>
          )}

          {currentStep === 1 && (
            <motion.div
              key="terms-step"
              id="agreement-step-1"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
          <div className="space-y-4 rounded-[1.25rem] border border-primary/25 bg-primary/[0.03] p-5 transition-all">
            <div className="flex items-center gap-2 text-foreground font-medium">
              <Calculator className="w-5 h-5 text-primary" />
              <span>จำนวนเงิน</span>
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">ยอดรวม (บาท)</Label>
              <Input
                id="amount"
                type="number"
                placeholder="10,000"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              />
            </div>
          </div>


          {/* Installments */}
          <div
            className={`space-y-4 rounded-[1.25rem] border border-border/80 bg-card/90 p-5 transition-all ${
              currentStep === 1 ? "border-primary/25 bg-primary/[0.03]" : ""
            }`}
          >
            <div className="flex items-center gap-2 text-foreground font-medium">
              <Calendar className="w-5 h-5 text-primary" />
              <span>การผ่อนชำระ</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="installments">จำนวนงวด</Label>
                <Input
                  id="installments"
                  type="number"
                  min="1"
                  value={formData.installments}
                  onChange={(e) => setFormData({ ...formData, installments: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="frequency">รอบชำระ</Label>
                <select
                  id="frequency"
                  className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={formData.frequency}
                  onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                >
                  <option value="daily">รายวัน</option>
                  <option value="weekly">รายสัปดาห์</option>
                  <option value="monthly">รายเดือน</option>
                </select>
              </div>
            </div>
            {/* Weekly: Day of week dropdown */}
            {formData.frequency === "weekly" && (
              <div className="space-y-2">
                <Label>ชำระทุกวัน{THAI_DAY_NAMES[Number(formData.weeklyDay)]}</Label>
                <select
                  className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={formData.weeklyDay}
                  onChange={(e) => setFormData({ ...formData, weeklyDay: e.target.value })}
                >
                  {THAI_DAY_NAMES.map((day, index) => (
                    <option key={index} value={index.toString()}>
                      วัน{day}
                    </option>
                  ))}
                </select>
                {/* Show upcoming dates for this day */}
                <div className="bg-secondary/50 rounded-lg p-3 space-y-1">
                  <p className="text-xs text-muted-foreground font-medium">วันที่ชำระ ({formData.installments} งวด)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(() => {
                      const targetDay = Number(formData.weeklyDay);
                      const today = getBangkokTodayDate();
                      const dates: Date[] = [];
                      const current = new Date(today.getTime());
                      
                      // Find the first occurrence of targetDay from today
                      while (current.getUTCDay() !== targetDay) {
                        current.setUTCDate(current.getUTCDate() + 1);
                      }
                      
                      // Collect dates for all installments
                      for (let i = 0; i < Number(formData.installments); i++) {
                        dates.push(new Date(current.getTime()));
                        current.setUTCDate(current.getUTCDate() + 7);
                      }
                      
                      return dates.map((date, idx) => (
                        <span key={idx} className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                          {date.toLocaleDateString('th-TH', {
                            day: 'numeric',
                            month: 'short',
                            timeZone: BANGKOK_TIME_ZONE,
                          })}
                        </span>
                      ));
                    })()}
                  </div>
                </div>
              </div>
            )}

            {/* Daily/Monthly: Date picker */}
            {formData.frequency !== "weekly" && (
              <div className="space-y-2">
                <Label htmlFor="startDate">
                  {formData.frequency === "monthly" && "ชำระทุกวันที่"}
                  {formData.frequency === "daily" && "เริ่มชำระวันที่"}
                </Label>
                <Input
                  id="startDate"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                />
                {formData.startDate && (
                  <p className="text-sm text-muted-foreground">
                    {formData.frequency === "monthly" && (() => {
                      const dayOfMonth = parseBangkokDate(formData.startDate)?.getUTCDate() ?? 1;
                      return `ชำระทุกวันที่ ${dayOfMonth}`;
                    })()}
                    {formData.frequency === "daily" && "ชำระทุกวัน"}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Interest */}
          <div className="space-y-4 rounded-[1.25rem] border border-border/80 bg-card/90 p-5">
            <div className="flex items-center gap-2 text-foreground font-medium">
              <Percent className="w-5 h-5 text-primary" />
              <span>ดอกเบี้ย (ไม่บังคับ)</span>
            </div>

            {/* Interest Type Selection */}
            <div className="space-y-2">
              <Label>รูปแบบดอกเบี้ย</Label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(interestTypeLabels) as InterestType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setFormData({ ...formData, interestType: type })}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      formData.interestType === type
                        ? "border-primary bg-primary/10"
                        : "border-input bg-background hover:border-primary/50"
                    }`}
                  >
                    <p className="text-sm font-medium text-foreground">{interestTypeLabels[type].title}</p>
                    <p className="text-xs text-muted-foreground">{interestTypeLabels[type].desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Interest Rate Input (only if interest type is selected) */}
            {formData.interestType !== "none" && (
              <div className="space-y-2">
                <Label htmlFor="interest">อัตราดอกเบี้ย (% ต่อปี)</Label>
                <Input
                  id="interest"
                  type="number"
                  max="15"
                  step="0.1"
                  placeholder="สูงสุด 15%"
                  value={formData.interest}
                  onChange={(e) => {
                    const value = Math.min(Number(e.target.value), 15);
                    setFormData({ ...formData, interest: value > 0 ? String(value) : e.target.value });
                  }}
                />
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Info className="w-3 h-3" />
                  สูงสุด 15% ต่อปี
                </p>
              </div>
            )}

            {/* Reschedule Fee Rate (for no-interest agreements) */}
            {formData.interestType === "none" && (
              <div className="space-y-3 pt-3 border-t border-border/50">
                <Label className="flex items-center gap-2">
                  <Coins className="w-4 h-4 text-amber-500" />
                  ค่าเลื่อนงวด
                </Label>
                
                <div className="bg-amber-500/10 rounded-xl p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">อัตราค่าเลื่อน</span>
                    <span className="text-lg font-semibold text-amber-600 dark:text-amber-400">
                      {formData.rescheduleFeeRate}%
                    </span>
                  </div>
                  
                  <Slider
                    value={[Number(formData.rescheduleFeeRate)]}
                    onValueChange={(value) => setFormData({ ...formData, rescheduleFeeRate: value[0].toString() })}
                    min={1}
                    max={20}
                    step={1}
                    className="py-2"
                  />
                  
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>1%</span>
                    <span>20%</span>
                  </div>
                  
                  {(() => {
                    const installmentAmount = Math.ceil(Number(formData.amount) / Number(formData.installments)) || 0;
                    const feeAmount = Math.ceil((installmentAmount * Number(formData.rescheduleFeeRate)) / 100);
                    return (
                      <div className="bg-background/80 rounded-lg p-3 text-center">
                        <p className="text-xs text-muted-foreground">ค่าเลื่อนต่อครั้ง</p>
                        <p className="text-xl font-bold text-amber-600 dark:text-amber-400">
                          ฿{feeAmount.toLocaleString()}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          ({formData.rescheduleFeeRate}% ของค่างวด ฿{installmentAmount.toLocaleString()})
                        </p>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Reschedule Fee Selector (for interest-bearing agreements) - Pay interest portion upfront */}
            {formData.interestType !== "none" && Number(formData.interest) > 0 && (
              <div className="space-y-3 pt-3 border-t border-border/50">
                <Label className="flex items-center gap-2">
                  <Coins className="w-4 h-4 text-amber-500" />
                  ค่าเลื่อนงวด (จ่ายดอกก่อน)
                </Label>
                
                <div className="bg-amber-500/10 rounded-xl p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">จ่ายดอกก่อน</span>
                    <span className="text-lg font-semibold text-amber-600 dark:text-amber-400">
                      {formData.rescheduleInterestPercent}%
                    </span>
                  </div>
                  
                  <Slider
                    value={[Number(formData.rescheduleInterestPercent)]}
                    onValueChange={(value) => setFormData({ ...formData, rescheduleInterestPercent: value[0].toString() })}
                    min={10}
                    max={100}
                    step={10}
                    className="py-2"
                  />
                  
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>10%</span>
                    <span>100%</span>
                  </div>
                  
                  {(() => {
                    const interestAmount = selectedCalculation?.schedule[0]?.interest || 0;
                    const feeAmount = Math.ceil((interestAmount * Number(formData.rescheduleInterestPercent)) / 100);
                    return (
                      <div className="bg-background/80 rounded-lg p-3 text-center">
                        <p className="text-xs text-muted-foreground">ค่าเลื่อนต่อครั้ง</p>
                        <p className="text-xl font-bold text-amber-600 dark:text-amber-400">
                          ฿{feeAmount.toLocaleString()}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          ({formData.rescheduleInterestPercent}% ของดอก ฿{interestAmount.toLocaleString()})
                        </p>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Quick Calculator Summary */}
            {selectedCalculation && Number(formData.amount) > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-secondary/50 rounded-xl p-4 space-y-3"
              >
                <div className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                  <Calculator className="w-4 h-4 text-primary" />
                  <span>สรุปการคำนวณ</span>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-background/50 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">เงินต้น</p>
                    <p className="text-sm font-medium text-foreground">
                      ฿{Number(formData.amount).toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-background/50 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">ดอกเบี้ยรวม</p>
                    <p className="text-sm font-medium text-foreground">
                      ฿{selectedCalculation.totalInterest.toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-background/50 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">จำนวนครั้งชำระ</p>
                    <p className="text-sm font-medium text-foreground">
                      {formData.installments} งวด
                    </p>
                  </div>
                  <div className="bg-primary/10 rounded-lg p-3 text-center border border-primary/20">
                    <p className="text-xs text-muted-foreground">ชำระครั้งละ</p>
                    <p className="text-lg font-semibold text-primary">
                      ฿{selectedCalculation.perInstallment.toLocaleString()}
                    </p>
                  </div>
                </div>
                
                {formData.interestType !== "none" && Number(formData.interest) > 0 && (
                  <div className="text-center pt-2 border-t border-border/50">
                    <p className="text-xs text-muted-foreground">ยอดรวมทั้งหมด</p>
                    <p className="text-base font-semibold text-foreground">
                      ฿{selectedCalculation.totalAmount.toLocaleString()}
                    </p>
                  </div>
                )}

                {/* Reschedule Fee Preview - No Interest */}
                {formData.interestType === "none" && (
                  <div className={`pt-2 border-t -mx-4 -mb-4 px-4 pb-4 rounded-b-xl space-y-2 ${
                    rescheduleFeeAnalysis.isOverCeiling 
                      ? 'border-red-500/30 bg-red-500/10' 
                      : rescheduleFeeAnalysis.isNearCeiling 
                        ? 'border-amber-500/30 bg-amber-500/10' 
                        : 'border-amber-500/30 bg-amber-500/5'
                  }`}>
                    <div className="flex justify-between items-center text-sm pt-2">
                      <span className={`flex items-center gap-1 font-medium ${
                        rescheduleFeeAnalysis.isOverCeiling 
                          ? 'text-red-700 dark:text-red-400' 
                          : 'text-amber-700 dark:text-amber-400'
                      }`}>
                        ค่าเลื่อนงวด
                      </span>
                      <span className={`font-semibold ${
                        rescheduleFeeAnalysis.isOverCeiling 
                          ? 'text-red-700 dark:text-red-400' 
                          : 'text-amber-700 dark:text-amber-400'
                      }`}>
                        ฿{rescheduleFeeAnalysis.feePerRequest.toLocaleString()}/ครั้ง
                      </span>
                    </div>
                    {/* 15% Annual Ceiling Warning */}
                    {rescheduleFeeAnalysis.isNearCeiling && !rescheduleFeeAnalysis.isOverCeiling && (
                      <div className="flex items-start gap-2 pt-2 border-t border-amber-500/20">
                        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                        <div className="text-xs">
                          <p className="font-medium text-amber-700 dark:text-amber-400">
                            ใกล้เพดาน 15%/ปี
                          </p>
                        </div>
                      </div>
                    )}
                    
                    {rescheduleFeeAnalysis.isOverCeiling && (
                      <div className="flex items-start gap-2 pt-2 border-t border-red-500/20">
                        <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                        <div className="text-xs">
                          <p className="font-medium text-red-700 dark:text-red-400">
                            เกินเพดาน 15%/ปี
                          </p>
                          <p className="text-amber-700 dark:text-amber-400 mt-1">
                            แนะนำลดค่าเลื่อนงวด
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Reschedule Fee Preview - With Interest (Prepay Interest) */}
                {formData.interestType !== "none" && Number(formData.interest) > 0 && selectedCalculation && selectedCalculation.schedule && selectedCalculation.schedule.length > 0 && (
                  <div className="pt-2 border-t -mx-4 -mb-4 px-4 pb-4 rounded-b-xl space-y-2 border-primary/30 bg-primary/5">
                    <div className="flex justify-between items-center text-sm pt-2">
                      <span className="flex items-center gap-1 font-medium text-primary">
                        ค่าเลื่อนงวด
                      </span>
                      <span className="font-semibold text-primary">
                        ฿{rescheduleFeeAnalysis.feePerRequest.toLocaleString()}/ครั้ง
                      </span>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </div>
            </motion.div>
          )}

          {currentStep === 2 && (
            <motion.div
              key="account-step"
              id="agreement-step-2"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4 rounded-[1.25rem] border border-primary/25 bg-primary/[0.03] p-5 transition-all"
            >
            <div className="flex items-center gap-2 text-foreground font-medium">
              <Building className="w-5 h-5 text-primary" />
              <div className="flex flex-col">
                <span>บัญชีรับเงินคืน</span>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2 md:col-span-1">
                <Label>ธนาคารหรือช่องทางรับเงิน</Label>
                <Select value={formData.bankName} onValueChange={(value) => setFormData({ ...formData, bankName: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="เลือกธนาคาร" />
                  </SelectTrigger>
                  <SelectContent>
                    {THAI_BANKS.map((bank) => (
                      <SelectItem key={bank.value} value={bank.value}>
                        {bank.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="accountNumber">
                  {formData.bankName === "promptpay" ? "PromptPay ID" : "เลขบัญชี"}
                </Label>
                <Input
                  id="accountNumber"
                  value={formData.accountNumber}
                  onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                  placeholder={formData.bankName === "promptpay" ? "0812345678" : "123-4-56789-0"}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="accountName">ชื่อบัญชี</Label>
                <Input
                  id="accountName"
                  value={formData.accountName}
                  onChange={(e) => setFormData({ ...formData, accountName: e.target.value })}
                  placeholder="ชื่อผู้ถือบัญชี"
                />
              </div>
            </div>

            {!formData.bankName || !formData.accountNumber ? (
              <InlineValidationMessage
                tone="warning"
                message="กรุณาระบุบัญชีของคุณให้ครบก่อนขยับไปขั้นตรวจสอบสุดท้าย"
              />
            ) : null}
            </motion.div>
          )}

          {/* Final review */}
          {currentStep === 3 && selectedCalculation && Number(formData.amount) > 0 && (
            <motion.div
              id="agreement-review-summary"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4 rounded-[1.25rem] border border-primary/20 bg-card/90 p-5 transition-all"
            >
              <div className="flex items-center gap-2 text-foreground font-medium">
                <Calculator className="w-5 h-5 text-primary" />
                <span>สรุปการคำนวณ</span>
              </div>

              {/* Summary Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-secondary/50 rounded-xl p-3 text-center">
                  <p className="text-xs text-muted-foreground">จำนวนเงิน</p>
                  <p className="text-lg font-semibold text-foreground">฿{Number(formData.amount).toLocaleString()}</p>
                </div>
                <div className="bg-secondary/50 rounded-xl p-3 text-center">
                  <p className="text-xs text-muted-foreground">จำนวนงวด</p>
                  <p className="text-lg font-semibold text-foreground">{formData.installments} งวด</p>
                </div>
                <div className="bg-secondary/50 rounded-xl p-3 text-center">
                  <p className="text-xs text-muted-foreground">รอบชำระ</p>
                  <p className="text-lg font-semibold text-foreground">{frequencyLabels[formData.frequency]}</p>
                </div>
                <div className="bg-secondary/50 rounded-xl p-3 text-center">
                  <p className="text-xs text-muted-foreground">ดอกเบี้ย</p>
                  <p className="text-lg font-semibold text-foreground">
                    {formData.interestType === "none" ? "ไม่มี" : `${formData.interest || 0}%`}
                  </p>
                </div>
              </div>

              {/* Payment per installment highlight */}
              <div className="bg-primary/10 rounded-xl p-4 text-center">
                <p className="text-sm text-muted-foreground">ยอดชำระต่องวด</p>
                <p className="text-3xl font-heading font-bold text-primary">
                  ฿{selectedCalculation.perInstallment.toLocaleString()}
                </p>
              </div>

              {/* Interest summary with Pie Chart */}
              {formData.interestType !== "none" && Number(formData.interest) > 0 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-primary/10 rounded-xl p-3 text-center">
                      <p className="text-xs text-muted-foreground">เงินต้น</p>
                      <p className="text-lg font-semibold text-primary">
                        ฿{Number(formData.amount).toLocaleString()}
                      </p>
                    </div>
                    <div className="bg-status-pending/10 rounded-xl p-3 text-center">
                      <p className="text-xs text-muted-foreground">ดอกเบี้ยรวม</p>
                      <p className="text-lg font-semibold text-status-pending">
                        ฿{selectedCalculation.totalInterest.toLocaleString()}
                      </p>
                    </div>
                  </div>
                  
                  {/* Pie Chart */}
                  <div className="bg-secondary/30 rounded-xl p-4">
                    <p className="text-xs font-medium text-center text-muted-foreground mb-2">สัดส่วนเงินต้น vs ดอกเบี้ย</p>
                    <div className="h-40">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Tooltip 
                            formatter={(value: number, name: string) => [
                              `฿${value.toLocaleString()}`,
                              name
                            ]}
                            contentStyle={{
                              backgroundColor: 'hsl(var(--card))',
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '8px',
                              padding: '8px 12px',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                            }}
                            labelStyle={{ color: 'hsl(var(--foreground))' }}
                            itemStyle={{ color: 'hsl(var(--foreground))' }}
                          />
                          <Pie
                            data={[
                              { name: "เงินต้น", value: Number(formData.amount), color: "hsl(var(--primary))" },
                              { name: "ดอกเบี้ย", value: selectedCalculation.totalInterest, color: "hsl(var(--status-pending))" }
                            ]}
                            cx="50%"
                            cy="50%"
                            innerRadius={35}
                            outerRadius={55}
                            paddingAngle={2}
                            dataKey="value"
                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                            labelLine={false}
                            animationBegin={0}
                            animationDuration={600}
                            animationEasing="ease-out"
                          >
                            <Cell fill="hsl(var(--primary))" />
                            <Cell fill="hsl(var(--status-pending))" />
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex justify-center gap-4 mt-2 text-xs">
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-full bg-primary" />
                        <span className="text-muted-foreground">เงินต้น ({((Number(formData.amount) / selectedCalculation.totalAmount) * 100).toFixed(1)}%)</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-full bg-status-pending" />
                        <span className="text-muted-foreground">ดอกเบี้ย ({((selectedCalculation.totalInterest / selectedCalculation.totalAmount) * 100).toFixed(1)}%)</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-accent/50 rounded-xl p-3 text-center">
                    <p className="text-xs text-muted-foreground">ยอดรวมทั้งหมด</p>
                    <p className="text-lg font-semibold text-foreground">
                      ฿{selectedCalculation.totalAmount.toLocaleString()}
                    </p>
                  </div>
                </div>
              )}

              {/* Payment Schedule Preview */}
              {paymentSchedule.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">ตารางชำระ</p>
                  <div className="max-h-48 overflow-y-auto space-y-2">
                    {paymentSchedule.map((item) => (
                      <div
                        key={item.installment}
                        className="flex justify-between items-center bg-secondary/30 rounded-lg p-3 text-sm"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                            {item.installment}
                          </span>
                          <div>
                            <p className="font-medium text-foreground">งวดที่ {item.installment}</p>
                            <p className="text-xs text-muted-foreground">
                              {item.date.toLocaleDateString("th-TH", {
                                day: "numeric",
                                month: "short",
                                year: "2-digit",
                              })}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-foreground">฿{item.amount.toLocaleString()}</p>
                          {formData.interestType !== "none" && Number(formData.interest) > 0 && (
                            <p className="text-xs text-muted-foreground">
                              เงินต้น ฿{item.principal.toLocaleString()} | ดอก ฿{item.interest.toLocaleString()}
                            </p>
                          )}
                          {formData.interestType === "none" && (
                            <p className="text-xs text-muted-foreground">
                              เงินต้น ฿{item.amount.toLocaleString()}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* Review before Submit */}
          {currentStep === 3 && Number(formData.amount) > 0 && selectedCalculation && (
            <motion.div
              id="agreement-step-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="transition-all"
            >
              <ReviewPanel
                title="ตรวจสอบทั้งหมดก่อนส่ง"
                description="ข้อมูลนี้จะถูกส่งให้ผู้ยืมยืนยันในขั้นถัดไป"
                rows={reviewRows}
              />
            </motion.div>
          )}

          <PrimaryActionBar>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-muted-foreground">
                {currentStep < stepDefinitions.length - 1
                  ? `ขั้นถัดไป: ${stepDefinitions[currentStep + 1].title}`
                  : "พร้อมส่งให้ผู้ยืมยืนยัน"}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => (currentStep === 0 ? navigate(-1) : setCurrentStep((step) => step - 1))}
                >
                  {currentStep === 0 ? (
                    "ยกเลิก"
                  ) : (
                    <>
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      ย้อนกลับ
                    </>
                  )}
                </Button>
                {currentStep < stepDefinitions.length - 1 ? (
                  <Button
                    type="button"
                    onClick={() => setCurrentStep((step) => step + 1)}
                    disabled={!canProceedByStep[currentStep]}
                  >
                    ถัดไป
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={isSubmitting || !canProceedByStep[currentStep]}
                  >
                    {isSubmitting ? (
                      "กำลังส่งคำขอ..."
                    ) : (
                      <>
                        <Send className="mr-2 h-4 w-4" />
                        ส่งให้ผู้ยืมยืนยัน
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </PrimaryActionBar>
        </motion.form>
        </StepFlowLayout>

        {/* Password Confirmation Dialog */}
        <PasswordConfirmDialog
          open={showPasswordConfirm}
          onOpenChange={setShowPasswordConfirm}
          onConfirm={handleConfirmedSubmit}
          title="ยืนยันการส่งคำขอให้ผู้ยืม"
          description="กรุณาใส่รหัสผ่านเพื่อยืนยันการสร้างข้อตกลงในฐานะผู้ให้ยืม"
          confirmButtonText="ส่งให้ผู้ยืมยืนยัน"
          isLoading={isSubmitting}
        />
        <QRCodeScanner
          open={showBorrowerScanner}
          onClose={() => setShowBorrowerScanner(false)}
          onScan={handleBorrowerQrScanned}
        />
      </div>
    </div>
    </PageTransition>
  );
}

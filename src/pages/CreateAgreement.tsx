import { motion } from "framer-motion";
import { PageTransition } from "@/components/ux/PageTransition";
import { ArrowLeft, ArrowRight, Send, User, Calendar, Percent, Calculator, Info, AlertTriangle, Coins, Building, CheckCircle, Loader2, Link as LinkIcon, UserPlus, X } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useLocation, useNavigate } from "react-router-dom";
import { useState, useMemo, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useDebtAgreements, CreateAgreementInput } from "@/hooks/useDebtAgreements";
import { useDbFriends, type DbFriend } from "@/hooks/useDbFriends";
import { useAuth } from "@/contexts/AuthContext";
import { PasswordConfirmDialog } from "@/components/PasswordConfirmDialog";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

type SelectedBorrowerFriend = Pick<DbFriend, "id" | "friend_user_id" | "friend_name" | "friend_phone" | "nickname">;

interface SavedBankAccount {
  id: string;
  label: string | null;
  bank_name: string;
  account_number: string;
  account_name: string;
  is_default: boolean;
}

interface CreateAgreementLocationState {
  selectedFriend?: SelectedBorrowerFriend;
}

const BANGKOK_TIME_ZONE = "Asia/Bangkok";
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
  const { friends, isLoading: friendsLoading } = useDbFriends();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [showFriendPicker, setShowFriendPicker] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<SelectedBorrowerFriend | null>(null);
  const [savedBankAccounts, setSavedBankAccounts] = useState<SavedBankAccount[]>([]);
  const [selectedBankAccountId, setSelectedBankAccountId] = useState("");
  const [isLoadingBankAccounts, setIsLoadingBankAccounts] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);
  
  const [formData, setFormData] = useState({
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
    const state = location.state as CreateAgreementLocationState | null;
    if (!state?.selectedFriend) return;

    setFormData((prev) => ({
      ...prev,
      partnerName: state.selectedFriend?.nickname || state.selectedFriend?.friend_name || prev.partnerName,
    }));

    setSelectedFriend(state.selectedFriend);
  }, [location.state]);

  const handleSelectFriend = (friend: DbFriend) => {
    setSelectedFriend(friend);
    setFormData((prev) => ({
      ...prev,
      partnerName: friend.nickname || friend.friend_name,
    }));
    setShowFriendPicker(false);
  };

  const handleClearSelectedFriend = () => {
    setSelectedFriend(null);
    setFormData((prev) => ({
      ...prev,
      partnerName: "",
    }));
  };

  const applySavedBankAccount = useCallback((account: SavedBankAccount) => {
    setSelectedBankAccountId(account.id);
    setFormData((prev) => ({
      ...prev,
      bankName: account.bank_name,
      accountNumber: account.account_number,
      accountName: account.account_name,
    }));
  }, []);

  useEffect(() => {
    const fetchBankAccounts = async () => {
      if (!user?.id) {
        setIsLoadingBankAccounts(false);
        return;
      }

      setIsLoadingBankAccounts(true);
      const { data, error } = await supabase
        .from("user_bank_accounts")
        .select("id, label, bank_name, account_number, account_name, is_default")
        .eq("user_id", user.id)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching saved bank accounts:", error);
        toast.error("โหลดบัญชีรับเงินไม่สำเร็จ");
        setIsLoadingBankAccounts(false);
        return;
      }

      const accounts = data || [];
      setSavedBankAccounts(accounts);

      const accountToUse = accounts.find((account) => account.is_default) || accounts[0];
      if (accountToUse) {
        applySavedBankAccount(accountToUse);
      } else {
        setSelectedBankAccountId("");
        setFormData((prev) => ({
          ...prev,
          bankName: "",
          accountNumber: "",
          accountName: "",
        }));
      }

      setIsLoadingBankAccounts(false);
    };

    fetchBankAccounts();
  }, [user?.id, applySavedBankAccount]);

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

    if (!selectedFriend) {
      toast.error("กรุณาเลือกผู้ยืมจากรายชื่อเพื่อน");
      return;
    }

    if (selectedFriend?.friend_user_id && selectedFriend.friend_user_id === user.id) {
      toast.error("ไม่สามารถสร้างข้อตกลงกับตัวเองได้");
      return;
    }

    if (!selectedBankAccountId || !formData.bankName || !formData.accountNumber || !formData.accountName) {
      toast.error("กรุณาเลือกบัญชีรับเงินที่ตั้งค่าไว้");
      return;
    }

    // Show password confirmation dialog
    setShowPasswordConfirm(true);
  };

  // Actually submit after password verification
  const handleConfirmedSubmit = async () => {
    setIsSubmitting(true);

    try {
      const borrowerId = selectedFriend?.friend_user_id ?? undefined;
      const invitationToken = borrowerId ? undefined : createInvitationToken();
      const input: CreateAgreementInput = {
        borrower_id: borrowerId,
        borrower_phone: selectedFriend?.friend_phone || undefined,
        borrower_name: selectedFriend?.nickname || selectedFriend?.friend_name || undefined,
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

  const hasSelectedFriend = Boolean(selectedFriend);
  const hasSelectedBankAccount =
    Boolean(selectedBankAccountId) && Boolean(formData.bankName) && Boolean(formData.accountNumber) && Boolean(formData.accountName);
  const selectedSavedBankAccount = savedBankAccounts.find((account) => account.id === selectedBankAccountId);

  const stepDefinitions = [
    { title: "ผู้ยืม", description: "เลือกจากเพื่อน" },
    { title: "ยอดเงิน", description: "เงิน งวด ดอก" },
    { title: "บัญชี", description: "รับเงินคืน" },
    { title: "ตรวจสอบ", description: "Review all" },
  ];

  const canProceedByStep = [
    hasSelectedFriend,
    !!formData.amount && principalAmount > 0 && installmentCount > 0 && !!selectedCalculation,
    hasSelectedBankAccount,
    !!selectedCalculation && hasSelectedFriend && !!formData.amount && hasSelectedBankAccount,
  ];

  const getBankLabel = (value: string) => {
    return THAI_BANKS.find((bank) => bank.value === value)?.label || value;
  };

  const selectedBankLabel = formData.bankName ? getBankLabel(formData.bankName) : "ยังไม่ได้เลือก";

  const reviewRows = selectedCalculation
    ? [
        { label: "ผู้ยืม", value: selectedFriend?.nickname || selectedFriend?.friend_name || "-" },
        {
          label: "การผูกบัญชีผู้ยืม",
          value: selectedFriend
            ? selectedFriend.friend_user_id
              ? "เลือกจากรายชื่อเพื่อน"
              : "เลือกจากรายชื่อเพื่อน + ลิงก์เชิญ"
            : "-",
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

              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                {selectedFriend ? (
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">เลือกจากรายชื่อเพื่อน</p>
                      <p className="truncate font-medium text-foreground">
                        {selectedFriend.nickname || selectedFriend.friend_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {selectedFriend.friend_user_id ? "ผูกบัญชีผู้ยืมได้ทันที" : "ยังไม่ผูกบัญชี จะสร้างลิงก์เชิญให้ยืนยัน"}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={handleClearSelectedFriend}
                      aria-label="ล้างเพื่อนที่เลือก"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={() => setShowFriendPicker(true)}
                  >
                    <UserPlus className="h-4 w-4" aria-hidden="true" />
                    เลือกเพื่อนจากรายชื่อ
	                  </Button>
	                )}
	              </div>

              {!selectedFriend ? (
                <InlineValidationMessage tone="warning" message="กรุณาเลือกผู้ยืมจากรายชื่อเพื่อน" />
              ) : !selectedFriend.friend_user_id ? (
                <div className="flex items-start gap-2 rounded-xl border border-border/70 bg-background/70 p-3 text-xs text-muted-foreground">
                  <LinkIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <p>
                    เพื่อนคนนี้ยังไม่ผูกบัญชีผู้ใช้ ระบบจะสร้างลิงก์เชิญให้ผู้ยืมกดผูกบัญชีและยืนยันเอง
                  </p>
                </div>
              ) : (
                <InlineValidationMessage tone="success" message="ดึงข้อมูลผู้ยืมจากรายชื่อเพื่อนแล้ว" />
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

            {isLoadingBankAccounts ? (
              <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-background/70 p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                กำลังโหลดบัญชีรับเงิน
              </div>
            ) : savedBankAccounts.length > 0 ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>เลือกบัญชีที่ตั้งไว้</Label>
                  <Select
                    value={selectedBankAccountId}
                    onValueChange={(value) => {
                      const account = savedBankAccounts.find((item) => item.id === value);
                      if (account) applySavedBankAccount(account);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="เลือกบัญชีรับเงิน" />
                    </SelectTrigger>
                    <SelectContent>
                      {savedBankAccounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {(account.label || getBankLabel(account.bank_name))}
                          {account.is_default ? " · บัญชีหลัก" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>ธนาคารหรือช่องทางรับเงิน</Label>
                    <Input value={selectedBankLabel} readOnly />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="accountNumber">
                      {formData.bankName === "promptpay" ? "PromptPay ID" : "เลขบัญชี"}
                    </Label>
                    <Input
                      id="accountNumber"
                      value={formData.accountNumber}
                      readOnly
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="accountName">ชื่อบัญชี</Label>
                    <Input
                      id="accountName"
                      value={formData.accountName}
                      readOnly
                    />
                  </div>
                </div>

                {selectedSavedBankAccount ? (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">
                    <p className="font-medium text-foreground">
                      {selectedSavedBankAccount.label || selectedBankLabel}
                    </p>
                    <p className="text-muted-foreground">
                      ข้อมูลนี้จะถูกบันทึกลงสัญญานี้ตอนสร้างข้อตกลง
                    </p>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                <p className="text-sm font-medium text-foreground">ยังไม่มีบัญชีรับเงิน</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  เพิ่มบัญชีได้ที่หน้าโปรไฟล์ก่อนสร้างข้อตกลงในฐานะผู้ให้ยืม
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3"
                  onClick={() => navigate("/profile")}
                >
                  ไปตั้งค่าบัญชีรับเงิน
                </Button>
              </div>
            )}

            {!hasSelectedBankAccount ? (
              <InlineValidationMessage
                tone="warning"
                message="กรุณาเลือกบัญชีรับเงินที่ตั้งค่าไว้ก่อนขยับไปขั้นตรวจสอบสุดท้าย"
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

        <Dialog open={showFriendPicker} onOpenChange={setShowFriendPicker}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>เลือกเพื่อนเป็นผู้ยืม</DialogTitle>
            </DialogHeader>
            <div className="max-h-[60vh] space-y-2 overflow-y-auto py-2">
              {friendsLoading ? (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  กำลังโหลดรายชื่อเพื่อน...
                </div>
              ) : friends.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-5 text-center">
                  <p className="text-sm font-medium text-foreground">ยังไม่มีเพื่อน</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    เพิ่มเพื่อนจากหน้าโปรไฟล์ก่อน แล้วกลับมาเลือกผู้ยืมได้ทันที
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-4"
                    onClick={() => navigate("/friends")}
                  >
                    ไปหน้าเพื่อน
                  </Button>
                </div>
              ) : (
                friends.map((friend) => (
                  <button
                    key={friend.id}
                    type="button"
                    className="flex w-full items-center gap-3 rounded-xl border border-border/70 bg-background p-3 text-left transition-colors hover:bg-secondary/50"
                    onClick={() => handleSelectFriend(friend)}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                      {friend.friend_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {friend.nickname || friend.friend_name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {friend.nickname ? friend.friend_name : friend.friend_phone || "ไม่มีเบอร์โทร"}
                      </p>
                    </div>
                    {friend.friend_user_id ? (
                      <CheckCircle className="h-4 w-4 text-status-paid" aria-hidden="true" />
                    ) : (
                      <LinkIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    )}
                  </button>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>

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
      </div>
    </div>
    </PageTransition>
  );
}

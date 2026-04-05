import { motion, AnimatePresence } from "framer-motion";
import { PageTransition } from "@/components/ux/PageTransition";
import { ArrowLeft, User, Calendar, Percent, Calculator, Info, UserPlus, Check, X, AlertTriangle, ShieldCheck, Coins, Building } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { useLocation, useNavigate } from "react-router-dom";
import { useState, useMemo, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useDebtAgreements, CreateAgreementInput } from "@/hooks/useDebtAgreements";
import { useDbFriends, DbFriend } from "@/hooks/useDbFriends";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { PasswordConfirmDialog } from "@/components/PasswordConfirmDialog";
import { supabase } from "@/integrations/supabase/client";
import { SubscriptionBanner } from "@/components/SubscriptionBanner";
import { THAI_BANKS } from "@/constants/thaibanks";
import { buildEffectiveRateSchedule, getPeriodsPerYear } from "@/domains/debt/recalculateEffectiveRateSchedule";
import { divideMoney, roundMoney, sumMoney, toMoney } from "@/utils/money";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EmptyState,
  InlineValidationMessage,
  PageHeader,
  PageSection,
  PrimaryActionBar,
  ReviewPanel,
  StepFlowLayout,
  SummaryCard,
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
  return new Date(`${year}-${month}-${day}T00:00:00+07:00`);
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

export default function CreateAgreement() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { createAgreement } = useDebtAgreements();
  const { friends } = useDbFriends();
  const {
    quota,
    refetch: refetchLimits,
  } = useSubscription();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showFriendPicker, setShowFriendPicker] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<DbFriend | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  
  const [formData, setFormData] = useState({
    partnerPhone: "",
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

  const handleSelectFriend = useCallback((friend: DbFriend) => {
    setSelectedFriend(friend);
    setFormData((prev) => ({
      ...prev,
      partnerPhone: friend.friend_phone || "",
      partnerName: friend.friend_name,
    }));
    setShowFriendPicker(false);
  }, []);

  const handleClearFriend = useCallback(() => {
    setSelectedFriend(null);
    setFormData((prev) => ({
      ...prev,
      partnerPhone: "",
      partnerName: "",
    }));
  }, []);

  useEffect(() => {
    const state = location.state as { selectedFriend?: Partial<DbFriend> } | null;
    const locationFriend = state?.selectedFriend;
    if (!locationFriend?.friend_name || selectedFriend) return;

    const preselected = friends.find((friend) => friend.id === locationFriend.id) ?? null;
    if (preselected) {
      setSelectedFriend(preselected);
      setFormData((prev) => ({
        ...prev,
        partnerPhone: preselected.friend_phone || "",
        partnerName: preselected.friend_name,
      }));
      return;
    }

    setSelectedFriend({
      id: locationFriend.id ?? crypto.randomUUID(),
      friend_user_id: locationFriend.friend_user_id ?? null,
      friend_name: locationFriend.friend_name,
      friend_phone: locationFriend.friend_phone ?? null,
      nickname: null,
      created_at: new Date().toISOString(),
      user_id: user?.id ?? "",
    });
    setFormData((prev) => ({
      ...prev,
      partnerPhone: locationFriend.friend_phone || "",
      partnerName: locationFriend.friend_name || "",
    }));
  }, [friends, location.state, selectedFriend, user?.id]);

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

    if (!selectedFriend) {
      toast.error("กรุณาเลือกคู่สัญญาจากรายชื่อเพื่อน");
      return;
    }

    // VALIDATION: Lender cannot be the same as borrower
    if (selectedFriend.friend_user_id === user.id) {
      toast.error("ไม่สามารถสร้างข้อตกลงกับตัวเองได้");
      return;
    }

    // Show password confirmation dialog
    setShowPasswordConfirm(true);
  };

  // Actually submit after password verification
  const handleConfirmedSubmit = async () => {
    setIsSubmitting(true);

    try {
      const input: CreateAgreementInput = {
        borrower_id: selectedFriend?.friend_user_id || undefined,
        borrower_phone: formData.partnerPhone || undefined,
        borrower_name: formData.partnerName || undefined,
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
        await refetchLimits(); // Refresh limits after the RPC atomically consumes quota
        toast.success("ส่งคำขอข้อตกลงสำเร็จ!");
        navigate("/");
      }
    } catch (err: unknown) {
      // The RPC raises 'Agreement quota exceeded' when the user has no remaining
      // free slots and no purchased credits.  Catch it here so we can show a
      // localised, actionable message instead of the generic error toast that
      // createAgreement would produce.
      const message = err instanceof Error ? err.message : String(err);
      if (message.toLowerCase().includes('quota exceeded')) {
        toast.error(
          `สิทธิ์สร้างข้อตกลงไม่เพียงพอ กรุณาไปหน้าเลี้ยงกาแฟเพื่อซื้อสิทธิ์เพิ่ม`,
        );
      }
      // Non-quota errors are already surfaced by createAgreement via handleSupabaseError.
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
    none: { title: "ไม่คิดดอกเบี้ย", desc: "แบ่งจ่ายเท่ากันทุกงวด" },
    flat: { title: "Flat Rate", desc: "ดอกเบี้ยคงที่ เหมาะกับยืมเพื่อน" },
    effective: { title: "Effective Rate", desc: "ลดต้นลดดอก แบบสถาบันการเงิน" },
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

  const stepDefinitions = [
    { title: "เลือกคู่สัญญา", description: "ระบุคนที่จะอยู่ในข้อตกลงนี้" },
    { title: "กำหนดวงเงิน", description: "ตั้งเงินต้น งวด และดอกเบี้ย" },
    { title: "ตรวจแผนชำระ", description: "ดูตารางผ่อนและบัญชีรับเงิน" },
    { title: "ตรวจสอบก่อนส่ง", description: "สรุปเงื่อนไขและยืนยัน" },
  ];

  const canProceedByStep = [
    !!selectedFriend,
    !!formData.amount && principalAmount > 0 && installmentCount > 0,
    !!selectedCalculation && paymentSchedule.length > 0 && !!formData.bankName && !!formData.accountNumber,
    !!selectedCalculation && !!selectedFriend,
  ];

  const selectedBankLabel =
    THAI_BANKS.find((bank) => bank.value === formData.bankName)?.label || formData.bankName || "ยังไม่ได้เลือก";

  const reviewRows = selectedCalculation
    ? [
        { label: "คู่สัญญา", value: selectedFriend?.friend_name || "-" },
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
        },
        { label: "ชำระต่องวด", value: `฿${selectedCalculation.perInstallment.toLocaleString()}` },
        { label: "ยอดรวมทั้งหมด", value: `฿${selectedCalculation.totalAmount.toLocaleString()}` },
        { label: "บัญชีรับเงิน", value: selectedBankLabel },
      ]
    : [];

  useEffect(() => {
    const sectionIds = ["agreement-step-0", "agreement-step-1", "agreement-step-2", "agreement-step-3"];
    const target = document.getElementById(sectionIds[currentStep]);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [currentStep]);

  return (
    <PageTransition>
    <div className="min-h-screen">
      <div className="page-shell max-w-5xl">
        <PageHeader
          title="สร้างข้อตกลงใหม่"
          description="สร้างข้อตกลงแบบเป็นขั้นตอน เพื่อให้วงเงิน เงื่อนไข และบัญชีรับเงินชัดเจนก่อนส่ง"
          onBack={() => navigate(-1)}
        />

        {/* Subscription Banner */}
        {quota && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="mb-4"
          >
            <SubscriptionBanner
              type="agreement"
              used={quota.free_used}
              limit={quota.free_limit}
              credits={quota.credits ?? 0}
            />
          </motion.div>
        )}

        <StepFlowLayout
          title="Guided Agreement Builder"
          description="ใช้ปุ่มด้านล่างเพื่อเดินทีละขั้น ระบบจะเลื่อนไปยังส่วนที่เกี่ยวข้องให้อัตโนมัติ"
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
          {/* Partner */}
          <div
            id="agreement-step-0"
            className={`bg-card rounded-2xl p-5 shadow-card space-y-4 transition-all ${
              currentStep === 0 ? "ring-2 ring-primary/30 shadow-elevated" : ""
            }`}
          >
            <div className="flex items-center gap-2 text-foreground font-medium">
              <User className="w-5 h-5 text-primary" />
              <span>ข้อมูลคู่สัญญา</span>
            </div>
            
            {/* Selected Friend Display */}
            {selectedFriend ? (
              <div className="flex items-center gap-3 p-3 bg-primary/10 rounded-xl border border-primary/20">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <span className="text-sm font-medium text-primary">
                    {selectedFriend.friend_name.charAt(0)}
                  </span>
                </div>
                <div className="flex-1">
                  <p className="font-medium text-foreground">{selectedFriend.friend_name}</p>
                  {selectedFriend.friend_phone && (
                    <p className="text-xs text-muted-foreground">{selectedFriend.friend_phone}</p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleClearFriend}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowFriendPicker(true)}
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  เลือกจากรายชื่อเพื่อน
                </Button>
              </div>
            )}
          </div>

          {/* Amount */}
          <div
            id="agreement-step-1"
            className={`bg-card rounded-2xl p-5 shadow-card space-y-4 transition-all ${
              currentStep === 1 ? "ring-2 ring-primary/30 shadow-elevated" : ""
            }`}
          >
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
            className={`bg-card rounded-2xl p-5 shadow-card space-y-4 transition-all ${
              currentStep === 1 ? "ring-2 ring-primary/30 shadow-elevated" : ""
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
                      return `→ ชำระทุกวันที่ ${dayOfMonth} ของเดือน`;
                    })()}
                    {formData.frequency === "daily" && "→ ชำระทุกวัน"}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Interest */}
          <div className="bg-card rounded-2xl p-5 shadow-card space-y-4">
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
                  ไม่เกิน 15% ต่อปี ไม่คิดดอกเบี้ยทบต้น
                </p>
              </div>
            )}

            {/* Reschedule Fee Rate (for no-interest agreements) */}
            {formData.interestType === "none" && (
              <div className="space-y-3 pt-3 border-t border-border/50">
                <Label className="flex items-center gap-2">
                  <Coins className="w-4 h-4 text-amber-500" />
                  อัตราค่าเลื่อนงวด (ถ้ามีการขอเลื่อน)
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
                
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Info className="w-3 h-3" />
                  ค่าเลื่อนงวดจะคิดเมื่อผู้ยืมขอเลื่อนกำหนดชำระ (คิด % จากค่างวด)
                </p>
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
                
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Info className="w-3 h-3" />
                  ถ้าขอเลื่อน ให้จ่ายดอกงวดนั้นก่อน (ตัดดอกก่อนต้น) - ไม่เพิ่มดอกเบี้ยใหม่
                </p>
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
                        💰 ค่าเลื่อนงวด (ถ้ามี)
                      </span>
                      <span className={`font-semibold ${
                        rescheduleFeeAnalysis.isOverCeiling 
                          ? 'text-red-700 dark:text-red-400' 
                          : 'text-amber-700 dark:text-amber-400'
                      }`}>
                        ฿{rescheduleFeeAnalysis.feePerRequest.toLocaleString()}/ครั้ง
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      วิธีคิด: ค่างวด ฿{Math.ceil(Number(formData.amount) / Number(formData.installments)).toLocaleString()} × {formData.rescheduleFeeRate}%
                    </p>
                    
                    {/* 15% Annual Ceiling Warning */}
                    {rescheduleFeeAnalysis.isNearCeiling && !rescheduleFeeAnalysis.isOverCeiling && (
                      <div className="flex items-start gap-2 pt-2 border-t border-amber-500/20">
                        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                        <div className="text-xs">
                          <p className="font-medium text-amber-700 dark:text-amber-400">
                            ใกล้เพดาน 15%/ปี
                          </p>
                          <p className="text-muted-foreground">
                            หากเลื่อนทุกงวด อาจถึง ~{rescheduleFeeAnalysis.annualRateIfRescheduleEveryMonth?.toFixed(1)}%/ปี
                          </p>
                        </div>
                      </div>
                    )}
                    
                    {rescheduleFeeAnalysis.isOverCeiling && (
                      <div className="flex items-start gap-2 pt-2 border-t border-red-500/20">
                        <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                        <div className="text-xs">
                          <p className="font-medium text-red-700 dark:text-red-400">
                            ⚠️ เกินเพดาน 15%/ปี
                          </p>
                          <p className="text-muted-foreground">
                            หากเลื่อนทุกงวด จะถึง ~{rescheduleFeeAnalysis.annualRateIfRescheduleEveryMonth?.toFixed(1)}%/ปี ซึ่งผิดกฎหมาย
                          </p>
                          <p className="text-amber-700 dark:text-amber-400 mt-1">
                            แนะนำลด % ค่าเลื่อนงวดลง
                          </p>
                        </div>
                      </div>
                    )}
                    
                    {/* Safe indicator */}
                    {!rescheduleFeeAnalysis.isNearCeiling && !rescheduleFeeAnalysis.isOverCeiling && (
                      <div className="flex items-center gap-2 pt-2 border-t border-green-500/20">
                        <ShieldCheck className="w-4 h-4 text-green-600 dark:text-green-400" />
                        <p className="text-xs text-green-700 dark:text-green-400">
                          อยู่ในเกณฑ์ปลอดภัย ไม่เกิน 15%/ปี
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Reschedule Fee Preview - With Interest (Prepay Interest) */}
                {formData.interestType !== "none" && Number(formData.interest) > 0 && selectedCalculation && selectedCalculation.schedule && selectedCalculation.schedule.length > 0 && (
                  <div className="pt-2 border-t -mx-4 -mb-4 px-4 pb-4 rounded-b-xl space-y-2 border-primary/30 bg-primary/5">
                    <div className="flex justify-between items-center text-sm pt-2">
                      <span className="flex items-center gap-1 font-medium text-primary">
                        💰 ค่าเลื่อนงวด (จ่ายดอกก่อน)
                      </span>
                      <span className="font-semibold text-primary">
                        ฿{rescheduleFeeAnalysis.feePerRequest.toLocaleString()}/ครั้ง
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      วิธีคิด: ดอกเบี้ยงวดนั้น ฿{(rescheduleFeeAnalysis.interestPerInstallment || 0).toLocaleString()} × {formData.rescheduleInterestPercent}%
                    </p>
                    
                    {/* Explanation */}
                    <div className="flex items-center gap-2 pt-2 border-t border-primary/20">
                      <ShieldCheck className="w-4 h-4 text-green-600 dark:text-green-400" />
                      <p className="text-xs text-green-700 dark:text-green-400">
                        ไม่เพิ่มดอก - แค่จ่ายดอกงวดนั้นล่วงหน้า (ตัดดอกก่อน)
                      </p>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* Comparison Table (when interest is set) */}
            {Number(formData.amount) > 0 &&
              formData.interestType !== "none" &&
              Number(formData.interest) > 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="bg-muted/30 rounded-xl p-4 space-y-2"
                >
                  <p className="text-xs font-medium text-foreground">เปรียบเทียบทุกแบบ</p>
                  <div className="space-y-2">
                    {(["flat", "effective"] as InterestType[]).map((type) => {
                      const calc = calculations[type];
                      if (!calc) return null;
                      const isSelected = formData.interestType === type;
                      return (
                        <div
                          key={type}
                          className={`flex justify-between items-center text-xs p-2 rounded-lg ${
                            isSelected ? "bg-primary/10" : ""
                          }`}
                        >
                          <span className={isSelected ? "font-medium text-primary" : "text-muted-foreground"}>
                            {interestTypeLabels[type].title}
                          </span>
                          <span className={isSelected ? "font-medium text-primary" : "text-foreground"}>
                            ฿{calc.perInstallment.toLocaleString()}/งวด
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
            )}
          </div>

          <div
            className={`bg-card rounded-2xl p-5 shadow-card space-y-4 transition-all ${
              currentStep === 2 ? "ring-2 ring-primary/30 shadow-elevated" : ""
            }`}
          >
            <div className="flex items-center gap-2 text-foreground font-medium">
              <Building className="w-5 h-5 text-primary" />
              <span>บัญชีรับเงิน</span>
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

            {currentStep === 2 && (!formData.bankName || !formData.accountNumber) ? (
              <InlineValidationMessage
                tone="warning"
                message="กรุณาระบุบัญชีรับเงินให้ครบก่อนขยับไปขั้นตรวจสอบสุดท้าย"
              />
            ) : null}
          </div>

          {/* Real-time Calculation Summary */}
          {selectedCalculation && Number(formData.amount) > 0 && (
            <motion.div
              id="agreement-step-2"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={`bg-card rounded-2xl p-5 shadow-card space-y-4 border-2 border-primary/20 transition-all ${
                currentStep === 2 ? "ring-2 ring-primary/30 shadow-elevated" : ""
              }`}
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

          {/* Payment Summary before Submit */}
          {Number(formData.amount) > 0 && selectedCalculation && (
            <motion.div
              id="agreement-step-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`bg-card rounded-2xl p-5 shadow-card space-y-3 transition-all ${
                currentStep === 3 ? "ring-2 ring-primary/30 shadow-elevated" : ""
              }`}
            >
              <p className="text-sm font-medium text-foreground text-center">สรุปการชำระเงิน</p>
              <div className="space-y-2">
                <div className="flex justify-between items-center py-2 border-b border-border/50">
                  <span className="text-muted-foreground">เงินยืม</span>
                  <span className="font-medium text-foreground">฿{Number(formData.amount).toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border/50">
                  <span className="text-muted-foreground">% ดอกเบี้ย</span>
                  <span className="font-medium text-foreground">
                    {formData.interestType === "none" ? "ไม่มี" : `${formData.interest || 0}% ต่อปี`}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border/50">
                  <span className="text-muted-foreground">ค่าดอกเบี้ย</span>
                  <span className="font-medium text-foreground">฿{selectedCalculation.totalInterest.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border/50">
                  <span className="text-muted-foreground">จำนวนครั้งที่ชำระ</span>
                  <span className="font-medium text-foreground">
                    {formData.installments} งวด / {frequencyLabels[formData.frequency]}
                  </span>
                </div>
                
                {/* Reschedule Fee in Payment Summary */}
                <div className="flex justify-between items-center py-2 border-b border-amber-500/30 bg-amber-500/5 -mx-5 px-5">
                  <span className="text-amber-700 dark:text-amber-400 flex items-center gap-1">
                    💰 ค่าเลื่อนงวด (ถ้ามี)
                  </span>
                  <span className="font-medium text-amber-700 dark:text-amber-400">
                    {formData.interestType === "none" 
                      ? `฿${Math.ceil((Math.ceil(Number(formData.amount) / Number(formData.installments)) * Number(formData.rescheduleFeeRate)) / 100).toLocaleString()}/ครั้ง`
                      : `฿${Math.ceil(((selectedCalculation?.schedule?.[0]?.interest || 0) * Number(formData.rescheduleInterestPercent)) / 100).toLocaleString()}/ครั้ง`
                    }
                  </span>
                </div>
                <p className="text-xs text-muted-foreground pt-1">
                  {formData.interestType === "none"
                    ? `วิธีคิด: ค่างวด ฿${Math.ceil(Number(formData.amount) / Number(formData.installments)).toLocaleString()} × ${formData.rescheduleFeeRate}%`
                    : `วิธีคิด: ดอกเบี้ยงวดนั้น ฿${(selectedCalculation?.schedule?.[0]?.interest || 0).toLocaleString()} × ${formData.rescheduleInterestPercent}%`
                  }
                </p>
              </div>
            </motion.div>
          )}

          <PrimaryActionBar>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-muted-foreground">
                {currentStep < stepDefinitions.length - 1
                  ? `ขั้นถัดไป: ${stepDefinitions[currentStep + 1].title}`
                  : "คู่สัญญาจะได้รับแจ้งเตือนเพื่อเข้ามายืนยันข้อตกลง"}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => (currentStep === 0 ? navigate(-1) : setCurrentStep((step) => step - 1))}
                >
                  {currentStep === 0 ? "ยกเลิก" : "ย้อนกลับ"}
                </Button>
                {currentStep < stepDefinitions.length - 1 ? (
                  <Button
                    type="button"
                    onClick={() => setCurrentStep((step) => step + 1)}
                    disabled={!canProceedByStep[currentStep]}
                  >
                    ถัดไป
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={
                      isSubmitting ||
                      (!formData.partnerName && !formData.partnerPhone) ||
                      !formData.amount
                    }
                  >
                    {isSubmitting ? "กำลังสร้าง..." : "ส่งคำขอข้อตกลง"}
                  </Button>
                )}
              </div>
            </div>
          </PrimaryActionBar>
        </motion.form>
        </StepFlowLayout>

        {/* Friend Picker Dialog */}
        <Dialog open={showFriendPicker} onOpenChange={setShowFriendPicker}>
          <DialogContent className="max-w-md mx-4 max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-heading">เลือกคู่สัญญา</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-2 mt-4">
              {friends.length === 0 ? (
                <div className="text-center py-8">
                  <User className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">ยังไม่มีเพื่อนในลิสต์</p>
                  <Button 
                    variant="outline" 
                    className="mt-4"
                    onClick={() => {
                      setShowFriendPicker(false);
                      navigate("/profile");
                    }}
                  >
                    เพิ่มเพื่อนในโปรไฟล์
                  </Button>
                </div>
              ) : (
                friends.map((friend) => (
                  <motion.div
                    key={friend.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onClick={() => handleSelectFriend(friend)}
                    className="flex items-center gap-3 p-3 rounded-xl cursor-pointer bg-secondary hover:bg-secondary/80 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                      <span className="text-sm font-medium text-primary">
                        {friend.friend_name.charAt(0)}
                      </span>
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-foreground">{friend.friend_name}</p>
                      {friend.friend_phone && (
                        <p className="text-xs text-muted-foreground">{friend.friend_phone}</p>
                      )}
                    </div>
                    <Check className="w-4 h-4 text-transparent" />
                  </motion.div>
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
          title="ยืนยันการส่งข้อตกลง"
          description="กรุณาใส่รหัสผ่านเพื่อยืนยันการสร้างข้อตกลง"
          confirmButtonText="ส่งคำขอข้อตกลง"
          isLoading={isSubmitting}
        />
      </div>
    </div>
    </PageTransition>
  );
}

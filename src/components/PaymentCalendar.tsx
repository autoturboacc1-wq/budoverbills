import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, X, Wallet, ArrowDownLeft, ArrowUpRight, Upload, Check, Loader2, Eye, Filter, Clock, CreditCard } from "lucide-react";
import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useDebtAgreements, Installment } from "@/hooks/useDebtAgreements";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getUserRoleInAgreement, isInstallmentOverdue, isAgreementEffectivelyCompleted } from "@/domains/debt";
import {
  getPaymentSlipSignedUrl,
  uploadPaymentSlip,
  validatePaymentSlipFile,
} from "@/utils/paymentSlipStorage";

type PaymentStatus = "paid" | "pending" | "overdue" | "waiting_confirm" | "none";
type PaymentSource = "debt" | "group";
type UserRole = "lender" | "borrower";

interface CalendarDay {
  day: number;
  status: PaymentStatus;
  amount?: number;
  items: PaymentItem[];
}

type Frequency = "daily" | "weekly" | "monthly";

interface PaymentItem {
  id: string;
  type: PaymentSource;
  description: string;
  amount: number;
  status: PaymentStatus;
  dueDate?: string;
  role: UserRole;
  partnerName: string;
  agreementId?: string;
  paymentProofUrl?: string | null;
  confirmedByLender?: boolean;
  frequency?: Frequency;
}

const weekDays = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

const statusColors: Record<PaymentStatus, string> = {
  paid: "bg-status-paid/20 text-status-paid border-status-paid/30",
  pending: "bg-status-pending/20 text-status-pending border-status-pending/30",
  overdue: "bg-status-overdue/20 text-status-overdue border-status-overdue/30",
  // Use semantic status tokens (no hard-coded yellows)
  waiting_confirm: "bg-status-pending/20 text-status-pending border-status-pending/30",
  none: "bg-transparent text-muted-foreground",
};

const statusLabels: Record<PaymentStatus, string> = {
  paid: "ชำระแล้ว",
  pending: "รอชำระ",
  overdue: "เลยกำหนด",
  waiting_confirm: "รอยืนยันสลิป",
  none: "-",
};

const thaiMonths = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
];

const THAI_TIME_ZONE = "Asia/Bangkok";
const DAY_MS = 24 * 60 * 60 * 1000;

function getBangkokDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: THAI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getBangkokMidnightTimestamp(dateKey: string): number {
  return new Date(`${dateKey}T00:00:00+07:00`).getTime();
}

function formatBangkokDate(dateKey: string, options: Intl.DateTimeFormatOptions): string {
  return new Date(`${dateKey}T12:00:00+07:00`).toLocaleDateString("th-TH", {
    timeZone: THAI_TIME_ZONE,
    ...options,
  });
}

type RoleFilter = "lender" | "borrower";
type StatusFilter = "all" | "paid" | "pending" | "overdue" | "waiting_confirm";

interface PaymentCalendarProps {
  onRoleChange?: (role: RoleFilter) => void;
}

export function PaymentCalendar({ onRoleChange }: PaymentCalendarProps) {
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingPreviewUrl, setLoadingPreviewUrl] = useState(false);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("lender");
  const initializedRoleRef = useRef(false);

  // Notify parent when role changes
  useEffect(() => {
    onRoleChange?.(roleFilter);
  }, [roleFilter, onRoleChange]);
  const [statusFilters, setStatusFilters] = useState<StatusFilter[]>(["all"]);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingUpload = useRef<{ installmentId: string; agreementId: string } | null>(null);
  const { agreements, refresh: refreshAgreements, uploadSlip, confirmPayment } = useDebtAgreements();
  const { user } = useAuth();
  const agreementIds = useMemo(
    () => agreements.map((agreement) => agreement.id),
    [agreements]
  );

  // Realtime subscription for user-scoped agreement and installment changes
  useEffect(() => {
    if (!user?.id) return;

    const channels: Array<ReturnType<typeof supabase.channel>> = [];
    const invalidateAgreements = () => {
      void refreshAgreements();
    };

    const debtAgreementsChannel = supabase
      .channel(`calendar-debt-agreements-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'debt_agreements',
          filter: `lender_id=eq.${user.id}`,
        },
        invalidateAgreements
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'debt_agreements',
          filter: `borrower_id=eq.${user.id}`,
        },
        invalidateAgreements
      )
      .subscribe();

    channels.push(debtAgreementsChannel);

    for (const agreementId of agreementIds) {
      const installmentChannel = supabase
        .channel(`calendar-installments-${user.id}-${agreementId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'installments',
            filter: `agreement_id=eq.${agreementId}`,
          },
          invalidateAgreements
        )
        .subscribe();

      channels.push(installmentChannel);
    }

    return () => {
      channels.forEach((channel) => {
        void supabase.removeChannel(channel);
      });
    };
  }, [agreementIds, refreshAgreements, user?.id]);

  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();
  const thaiYear = currentYear + 543;

  const monthLabel = `${thaiMonths[currentMonth]} ${thaiYear}`;

  // Get days in month
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();

  // Toggle status filter
  const toggleStatusFilter = (status: StatusFilter) => {
    if (status === "all") {
      setStatusFilters(["all"]);
    } else {
      const newFilters = statusFilters.filter(s => s !== "all");
      if (newFilters.includes(status)) {
        const updated = newFilters.filter(s => s !== status);
        setStatusFilters(updated.length === 0 ? ["all"] : updated);
      } else {
        setStatusFilters([...newFilters, status]);
      }
    }
  };

  // Calculate calendar days with real data
  const calendarDays = useMemo<CalendarDay[]>(() => {
    const days: CalendarDay[] = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      let items: PaymentItem[] = [];

      // Find installments for this day
      // IMPORTANT: only show schedules for agreements that are actually in effect.
      // Cancelled/completed agreements must not create "ต้องชำระ/ต้องได้รับ" items.
      agreements.forEach(agreement => {
        // Only show schedules for active agreements that are NOT effectively completed
        if (agreement.status !== "active" && agreement.status !== "rescheduling") return;
        if (isAgreementEffectivelyCompleted(agreement.installments)) return;
        if (!agreement.installments) return;

        agreement.installments.forEach(inst => {
          if (inst.due_date === dateStr) {
            // Use domain layer for role determination
            const role = getUserRoleInAgreement(agreement, user?.id);
            if (!role) return;

            const isUserBorrower = role === 'borrower';
            const isUserLender = role === 'lender';

            let status: PaymentStatus = "pending";
            const instStatus = inst.status as string;
            
            if (instStatus === "paid") {
              status = "paid";
            } else if (inst.payment_proof_url && !inst.confirmed_by_lender && isUserLender) {
              // Lender sees "waiting for confirmation" when slip uploaded but not confirmed
              status = "waiting_confirm";
            } else if (isInstallmentOverdue(inst)) {
              // Use domain function instead of direct date comparison
              status = "overdue";
            }

            const partnerName = isUserBorrower 
              ? "เจ้าหนี้" 
              : (agreement.borrower_name || "ลูกหนี้");
            const itemRole: UserRole = isUserBorrower ? "borrower" : "lender";

            items.push({
              id: inst.id,
              type: "debt",
              description: isUserBorrower 
                ? `ต้องชำระ` 
                : `ต้องได้รับ`,
              amount: inst.amount,
              status,
              dueDate: inst.due_date,
              role: itemRole,
              partnerName,
              agreementId: agreement.id,
              paymentProofUrl: inst.payment_proof_url,
              confirmedByLender: inst.confirmed_by_lender,
              frequency: agreement.frequency as Frequency,
            });
          }
        });
      });

      // Apply role filter (no longer has "all" option)
      items = items.filter(item => item.role === roleFilter);
      
      if (!statusFilters.includes("all")) {
        items = items.filter(item => statusFilters.includes(item.status as StatusFilter));
      }

      // Determine overall status for the day
      let dayStatus: PaymentStatus = "none";
      let totalAmount = 0;

      if (items.length > 0) {
        totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
        
        // Priority: overdue > waiting_confirm > pending > paid
        if (items.some(item => item.status === "overdue")) {
          dayStatus = "overdue";
        } else if (items.some(item => item.status === "waiting_confirm")) {
          dayStatus = "waiting_confirm";
        } else if (items.some(item => item.status === "pending")) {
          dayStatus = "pending";
        } else if (items.every(item => item.status === "paid")) {
          dayStatus = "paid";
        }
      }

      days.push({
        day,
        status: dayStatus,
        amount: totalAmount > 0 ? totalAmount : undefined,
        items,
      });
    }

    return days;
  }, [agreements, user, currentMonth, currentYear, daysInMonth, roleFilter, statusFilters]);

  // Count active agreements by role - use domain layer
  // Exclude effectively completed agreements (all installments paid)
  const agreementCounts = useMemo(() => {
    if (!user?.id) return { lenderCount: 0, borrowerCount: 0 };
    
    const activeAgreements = agreements.filter(a => 
      a.status === 'active' && 
      !isAgreementEffectivelyCompleted(a.installments)
    );
    // Use domain function to determine role for each agreement
    const lenderCount = activeAgreements.filter(a => 
      getUserRoleInAgreement(a, user.id) === 'lender'
    ).length;
    const borrowerCount = activeAgreements.filter(a => 
      getUserRoleInAgreement(a, user.id) === 'borrower'
    ).length;
    return { lenderCount, borrowerCount };
  }, [agreements, user]);

  // Initialize role per-user so "คนยืม" จะไม่เปิดมาเจอแท็บ "ให้ยืม" โดยดีฟอลต์
  useEffect(() => {
    if (!user?.id || initializedRoleRef.current) return;
    const key = `payment-calendar-role:${user.id}`;
    const stored = localStorage.getItem(key);

    if (stored === "lender" || stored === "borrower") {
      setRoleFilter(stored);
      initializedRoleRef.current = true;
      return;
    }

    // Auto-pick based on what the user actually has
    if (agreementCounts.borrowerCount > 0 && agreementCounts.lenderCount === 0) {
      setRoleFilter("borrower");
    }

    initializedRoleRef.current = true;
  }, [user?.id, agreementCounts.borrowerCount, agreementCounts.lenderCount]);

  // Persist role per user
  useEffect(() => {
    if (!user?.id) return;
    localStorage.setItem(`payment-calendar-role:${user.id}`, roleFilter);
  }, [roleFilter, user?.id]);

  // Calculate summary by frequency for the selected role
  const frequencySummary = useMemo(() => {
    const todayKey = getBangkokDateKey();
    const todayMs = getBangkokMidnightTimestamp(todayKey);
    
    const createEmptyFreqSummary = () => ({
      total: 0,
      pending: 0,
      pendingCount: 0,
      nextPayment: null as { date: string; amount: number } | null,
    });
    
    const summaryByFreq: Record<Frequency, ReturnType<typeof createEmptyFreqSummary>> = {
      monthly: createEmptyFreqSummary(),
      weekly: createEmptyFreqSummary(),
      daily: createEmptyFreqSummary(),
    };
    
    // Track which frequencies the user actually has
    const activeFrequencies = new Set<Frequency>();

    calendarDays.forEach(day => {
      day.items.forEach(item => {
        // Only process items for the current role filter
        if (item.role !== roleFilter) return;
        if (!item.frequency) return;
        
        const freq = item.frequency;
        activeFrequencies.add(freq);
        summaryByFreq[freq].total += item.amount;
        
        if (item.status !== "paid") {
          summaryByFreq[freq].pending += item.amount;
          summaryByFreq[freq].pendingCount++;
          
          if (item.dueDate) {
            const itemMs = getBangkokMidnightTimestamp(item.dueDate);
            const nextPaymentMs = summaryByFreq[freq].nextPayment
              ? getBangkokMidnightTimestamp(summaryByFreq[freq].nextPayment!.date)
              : null;

            if (itemMs >= todayMs && (nextPaymentMs === null || itemMs < nextPaymentMs)) {
              summaryByFreq[freq].nextPayment = { date: item.dueDate, amount: item.amount };
            }
          }
        }
      });
    });
    
    // Calculate overall totals
    let totalAmount = 0;
    let totalPending = 0;
    let totalPendingCount = 0;
    
    Object.values(summaryByFreq).forEach(freq => {
      totalAmount += freq.total;
      totalPending += freq.pending;
      totalPendingCount += freq.pendingCount;
    });
    
    return {
      byFrequency: summaryByFreq,
      activeFrequencies: Array.from(activeFrequencies).sort((a, b) => {
        const order: Record<Frequency, number> = { monthly: 1, weekly: 2, daily: 3 };
        return order[a] - order[b];
      }),
      totalAmount,
      totalPending,
      totalPendingCount,
    };
  }, [calendarDays, roleFilter]);
  
  // Frequency labels in Thai
  const frequencyLabels: Record<Frequency, { period: string; noPending: string; paidComplete: string }> = {
    monthly: { period: "เดือนนี้", noPending: "เดือนนี้ไม่มีงวดต้องจ่าย", paidComplete: "เดือนนี้ชำระแล้ว" },
    weekly: { period: "สัปดาห์นี้", noPending: "สัปดาห์นี้ไม่มีงวดต้องจ่าย", paidComplete: "สัปดาห์นี้ชำระแล้ว" },
    daily: { period: "วันนี้", noPending: "วันนี้ไม่มีงวดต้องจ่าย", paidComplete: "วันนี้ชำระแล้ว" },
  };
  
  const frequencyLabelsLender: Record<Frequency, { period: string; noPending: string; paidComplete: string }> = {
    monthly: { period: "เดือนนี้", noPending: "เดือนนี้ไม่มีงวดต้องรับ", paidComplete: "เดือนนี้รับครบแล้ว" },
    weekly: { period: "สัปดาห์นี้", noPending: "สัปดาห์นี้ไม่มีงวดต้องรับ", paidComplete: "สัปดาห์นี้รับครบแล้ว" },
    daily: { period: "วันนี้", noPending: "วันนี้ไม่มีงวดต้องรับ", paidComplete: "วันนี้รับครบแล้ว" },
  };

  // Calculate upcoming installments within 3 days
  const upcomingInstallments = useMemo(() => {
    const todayKey = getBangkokDateKey();
    const todayMs = getBangkokMidnightTimestamp(todayKey);
    const threeDaysLaterMs = todayMs + (3 * DAY_MS);
    
    const upcoming: PaymentItem[] = [];
    
    calendarDays.forEach(day => {
      day.items.forEach(item => {
        if (item.dueDate && item.status !== "paid") {
          const itemMs = getBangkokMidnightTimestamp(item.dueDate);
          if (itemMs >= todayMs && itemMs <= threeDaysLaterMs && item.role === roleFilter) {
            upcoming.push(item);
          }
        }
      });
    });
    
    // Sort by date
    upcoming.sort((a, b) => getBangkokMidnightTimestamp(a.dueDate!) - getBangkokMidnightTimestamp(b.dueDate!));
    
    return upcoming;
  }, [calendarDays, roleFilter]);

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  };

  const handleDayClick = (day: CalendarDay) => {
    if (day.items.length === 0) return;
    setSelectedDay(day);
  };

  const closePopup = () => setSelectedDay(null);

  const openPreview = async (path: string) => {
    setLoadingPreviewUrl(true);
    const url = await getPaymentSlipSignedUrl(path, 600);
    setPreviewUrl(url);
    setLoadingPreviewUrl(false);
  };

  // Handle file upload for slip
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const pending = pendingUpload.current;
    if (!file || !pending) return;

    const validationError = validatePaymentSlipFile(file);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setUploadingId(pending.installmentId);

    try {
      const result = await uploadPaymentSlip({
        agreementId: pending.agreementId,
        kind: 'installment',
        entityId: pending.installmentId,
        file,
      });

      if ('error' in result) throw result.error;

      // Use file path instead of public URL
      const uploaded = await uploadSlip(pending.installmentId, result.path);
      if (uploaded) {
        toast.success("อัปโหลดสลิปสำเร็จ", { description: "รอเจ้าหนี้ยืนยันการชำระ" });
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("เกิดข้อผิดพลาดในการอัปโหลด");
    } finally {
      setUploadingId(null);
      pendingUpload.current = null;
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const triggerUpload = (installmentId: string, agreementId?: string) => {
    if (!agreementId) return;
    pendingUpload.current = { installmentId, agreementId };
    fileInputRef.current?.click();
  };

  const handleConfirmPayment = async (installmentId: string) => {
    setConfirmingId(installmentId);
    try {
      await confirmPayment(installmentId);
    } catch (error) {
      toast.error("เกิดข้อผิดพลาด");
    } finally {
      setConfirmingId(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="bg-card rounded-2xl p-5 shadow-card relative"
    >
      {/* Segmented Control for Role */}
      <div className="flex items-center bg-secondary/50 rounded-xl p-1 mb-4">
        <button
          onClick={() => setRoleFilter("lender")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-medium transition-all ${
            roleFilter === "lender"
              ? "bg-status-paid text-background shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <ArrowDownLeft className="w-4 h-4" />
          <span>ให้ยืม</span>
          {agreementCounts.lenderCount > 0 && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
              roleFilter === "lender" 
                ? "bg-background/20" 
                : "bg-status-paid/10 text-status-paid"
            }`}>
              {agreementCounts.lenderCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setRoleFilter("borrower")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-medium transition-all ${
            roleFilter === "borrower"
              ? "bg-status-pending text-background shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <ArrowUpRight className="w-4 h-4" />
          <span>ยืม</span>
          {agreementCounts.borrowerCount > 0 && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
              roleFilter === "borrower" 
                ? "bg-background/20" 
                : "bg-status-pending/10 text-status-pending"
            }`}>
              {agreementCounts.borrowerCount}
            </span>
          )}
        </button>
      </div>

      {/* Header with navigation and filter */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {/* Status Filter Button */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                !statusFilters.includes("all") 
                  ? "bg-primary text-primary-foreground" 
                  : "bg-secondary hover:bg-secondary/80"
              }`}>
                <Filter className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48 bg-popover border border-border shadow-lg z-50">
              <DropdownMenuLabel>กรองตามสถานะ</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={statusFilters.includes("all")}
                onCheckedChange={() => toggleStatusFilter("all")}
              >
                ทั้งหมด
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={statusFilters.includes("pending")}
                onCheckedChange={() => toggleStatusFilter("pending")}
              >
                <div className="w-2 h-2 rounded-full bg-status-pending mr-2" />
                รอชำระ
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={statusFilters.includes("waiting_confirm")}
                onCheckedChange={() => toggleStatusFilter("waiting_confirm")}
              >
                <div className="w-2 h-2 rounded-full bg-status-pending mr-2" />
                รอยืนยัน
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={statusFilters.includes("overdue")}
                onCheckedChange={() => toggleStatusFilter("overdue")}
              >
                <div className="w-2 h-2 rounded-full bg-status-overdue mr-2" />
                เลยกำหนด
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={statusFilters.includes("paid")}
                onCheckedChange={() => toggleStatusFilter("paid")}
              >
                <div className="w-2 h-2 rounded-full bg-status-paid mr-2" />
                ชำระแล้ว
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={handlePrevMonth}
            className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-secondary-foreground" />
          </button>
          <span className="text-sm font-medium text-foreground min-w-[120px] text-center">
            {monthLabel}
          </span>
          <button 
            onClick={handleNextMonth}
            className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-secondary-foreground" />
          </button>
        </div>
      </div>

      {/* Active Status Filters Display */}
      {!statusFilters.includes("all") && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {statusFilters.map(status => (
            <span key={status} className={`text-xs px-2 py-1 rounded-full flex items-center gap-1 ${statusColors[status]}`}>
              {statusLabels[status]}
              <button onClick={() => toggleStatusFilter(status)} className="ml-1 hover:opacity-70">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <button 
            onClick={() => setStatusFilters(["all"])}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            ล้างตัวกรอง
          </button>
        </div>
      )}

      {/* Week days header */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {weekDays.map((day) => (
          <div
            key={day}
            className="text-center text-xs font-medium text-muted-foreground py-2"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid with animation */}
      <AnimatePresence mode="wait">
        <motion.div
          key={roleFilter}
          initial={{ opacity: 0, x: roleFilter === "lender" ? -20 : 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: roleFilter === "lender" ? 20 : -20 }}
          transition={{ duration: 0.25, ease: "easeInOut" }}
          className="grid grid-cols-7 gap-1"
        >
          {/* Padding for days before month starts */}
          {Array.from({ length: firstDayOfMonth }).map((_, i) => (
            <div key={`pad-${i}`} className="aspect-square" />
          ))}

          {/* Actual days */}
          {calendarDays.map((calDay) => (
            <motion.button
              key={calDay.day}
              onClick={() => handleDayClick(calDay)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`aspect-square rounded-xl flex flex-col items-center justify-center text-sm font-medium transition-all border ${statusColors[calDay.status]} ${
                calDay.items.length > 0 ? "cursor-pointer" : "cursor-default"
              }`}
            >
              <span>{calDay.day}</span>
              {calDay.amount && (
                <span className="text-[10px] opacity-80">
                  {calDay.amount >= 1000 ? `฿${(calDay.amount / 1000).toFixed(1)}k` : `฿${calDay.amount}`}
                </span>
              )}
              {calDay.items.length > 1 && (
                <span className="text-[8px] opacity-60">{calDay.items.length} รายการ</span>
              )}
            </motion.button>
          ))}
        </motion.div>
      </AnimatePresence>

      {/* Summary by Frequency - shows only frequencies the user has */}
      <div className="mt-5 pt-4 border-t border-border">
        <AnimatePresence mode="wait">
          <motion.div
            key={roleFilter}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
          >
            {/* Show cards split by frequency only if user has multiple frequencies */}
            {frequencySummary.activeFrequencies.length > 1 ? (
              <div className="grid grid-cols-1 gap-3">
                {frequencySummary.activeFrequencies.map((freq) => {
                  const freqData = frequencySummary.byFrequency[freq];
                  const labels = roleFilter === "lender" ? frequencyLabelsLender[freq] : frequencyLabels[freq];
                  
                  // Check if all paid for this frequency
                  const allPaid = freqData.total > 0 && freqData.pendingCount === 0;
                  // If all paid: show green. Otherwise: lender=green, borrower=pending(orange)
                  const colorClass = allPaid ? "status-paid" : (roleFilter === "lender" ? "status-paid" : "status-pending");
                  const Icon = roleFilter === "lender" ? ArrowDownLeft : ArrowUpRight;
                  
                  return (
                    <div 
                      key={freq} 
                      className={`bg-${colorClass}/10 rounded-xl p-4 border border-${colorClass}/15`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Icon className={`w-4 h-4 text-${colorClass}`} />
                          <span className={`text-sm font-medium text-${colorClass}`}>
                            {allPaid 
                              ? labels.paidComplete
                              : `${roleFilter === "lender" ? "ต้องได้รับ" : "ต้องชำระ"}${labels.period}`
                            }
                          </span>
                        </div>
                        <p className={`font-heading font-bold text-lg text-${colorClass}`}>
                          ฿{freqData.total.toLocaleString()}
                        </p>
                      </div>
                      <div className={`text-xs text-${colorClass}/80`}>
                        {freqData.pendingCount > 0 
                          ? `${freqData.pendingCount} งวด • ${roleFilter === "lender" ? "ค้างรับ" : "ค้างจ่าย"} ฿${freqData.pending.toLocaleString()}`
                          : labels.noPending
                        }
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              // Single frequency or no agreements - show original design
              (() => {
                const freq = frequencySummary.activeFrequencies[0];
                const allPaid = frequencySummary.totalAmount > 0 && frequencySummary.totalPendingCount === 0;
                const labels = freq ? (roleFilter === "lender" ? frequencyLabelsLender[freq] : frequencyLabels[freq]) : null;
                
                // If all paid: use green for both roles
                const colorClass = allPaid ? "status-paid" : (roleFilter === "lender" ? "status-paid" : "status-pending");
                const Icon = roleFilter === "lender" ? ArrowDownLeft : ArrowUpRight;
                
                return (
                  <div className={`bg-${colorClass}/10 rounded-xl p-4 border border-${colorClass}/15`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Icon className={`w-5 h-5 text-${colorClass}`} />
                        <span className={`text-sm font-medium text-${colorClass}`}>
                          {allPaid 
                            ? (labels?.paidComplete || (roleFilter === "lender" ? "เดือนนี้รับครบแล้ว" : "เดือนนี้ชำระแล้ว"))
                            : `${roleFilter === "lender" ? "ต้องได้รับชำระ" : "ต้องชำระ"}${labels?.period || "เดือนนี้"}`
                          }
                        </span>
                      </div>
                      <p className={`font-heading font-bold text-xl text-${colorClass}`}>
                        ฿{frequencySummary.totalAmount.toLocaleString()}
                      </p>
                    </div>
                    <div className={`text-xs text-${colorClass}/80`}>
                      {frequencySummary.totalPendingCount > 0 
                        ? `${frequencySummary.totalPendingCount} งวด • ${roleFilter === "lender" ? "รอรับ" : "ค้างจ่าย"} ฿${frequencySummary.totalPending.toLocaleString()}`
                        : (labels?.noPending || (roleFilter === "lender" ? "เดือนนี้ไม่มีงวดต้องรับ" : "เดือนนี้ไม่มีงวดต้องจ่าย"))
                      }
                    </div>
                  </div>
                );
              })()
            )}
            {/* Upcoming installments within 3 days */}
            {upcomingInstallments.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="mt-3 bg-accent rounded-xl p-3 border border-border"
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-accent-foreground flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    งวดใกล้ถึงกำหนด (3 วันข้างหน้า)
                  </p>
                  {upcomingInstallments.length > 3 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs"
                      onClick={() => setShowAllUpcoming(true)}
                    >
                      ดูทั้งหมด ({upcomingInstallments.length})
                    </Button>
                  )}
                </div>
                <div className="space-y-2">
                  {upcomingInstallments.slice(0, 3).map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-muted-foreground shrink-0">
                          {formatBangkokDate(item.dueDate!, { day: 'numeric', month: 'short' })}
                        </span>
                        <span className="text-foreground truncate">{item.partnerName}</span>
                        {/* Status Badge */}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${statusColors[item.status]}`}>
                          {statusLabels[item.status]}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`font-medium ${
                          roleFilter === "lender" ? "text-status-paid" : "text-status-pending"
                        }`}>
                          ฿{item.amount.toLocaleString()}
                        </span>
                        {/* Quick Action Buttons */}
                        {item.type === "debt" && (
                          <>
                            {/* Borrower: Quick Upload Slip */}
                            {item.role === "borrower" && !item.confirmedByLender && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs"
                                onClick={() => triggerUpload(item.id, item.agreementId)}
                                disabled={uploadingId === item.id}
                              >
                                {uploadingId === item.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : item.paymentProofUrl ? (
                                  <>
                                    <Upload className="w-3 h-3 mr-1" />
                                    อัปใหม่
                                  </>
                                ) : (
                                  <>
                                    <Upload className="w-3 h-3 mr-1" />
                                    อัปโหลด
                                  </>
                                )}
                              </Button>
                            )}
                            {/* Lender: Quick Confirm Payment */}
                            {item.role === "lender" && item.paymentProofUrl && !item.confirmedByLender && (
                              <Button
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => handleConfirmPayment(item.id)}
                                disabled={confirmingId === item.id}
                              >
                                {confirmingId === item.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <>
                                    <Check className="w-3 h-3 mr-1" />
                                    ยืนยัน
                                  </>
                                )}
                              </Button>
                            )}
                            {/* View Slip Button */}
                            {item.paymentProofUrl && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs"
                                onClick={() => void openPreview(item.paymentProofUrl!)}
                              >
                                <Eye className="w-3 h-3" />
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                  {upcomingInstallments.length > 3 && (
                    <p className="text-xs text-muted-foreground">
                      และอีก {upcomingInstallments.length - 3} รายการ
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-3 mt-4 pt-3 border-t border-border">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-status-paid" />
          <span className="text-xs text-muted-foreground">ชำระแล้ว</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-status-pending" />
          <span className="text-xs text-muted-foreground">รอชำระ</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-status-pending" />
          <span className="text-xs text-muted-foreground">รอยืนยัน</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-status-overdue" />
          <span className="text-xs text-muted-foreground">เลยกำหนด</span>
        </div>
      </div>

      {/* Hidden file input for slip upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Day Detail Popup */}
      <AnimatePresence>
        {selectedDay && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute inset-0 bg-card/95 backdrop-blur-sm rounded-2xl p-5 z-10 flex flex-col"
          >
            {/* Popup Header */}
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-heading font-semibold text-lg text-foreground">
                วันที่ {selectedDay.day} {thaiMonths[currentMonth]}
              </h4>
              <button 
                onClick={closePopup}
                className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors"
                aria-label="ปิดรายละเอียดวัน"
              >
                <X className="w-4 h-4 text-secondary-foreground" />
              </button>
            </div>

            {/* Items List */}
            <div className="flex-1 overflow-auto space-y-3">
              {selectedDay.items.map((item) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-secondary/50 rounded-xl p-3"
                >
                  <div className="flex items-center gap-3">
                    {/* Role Icon */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                      item.role === "lender" ? "bg-status-paid/10" : "bg-status-pending/10"
                    }`}>
                      {item.role === "lender" ? (
                        <ArrowDownLeft className="w-5 h-5 text-status-paid" />
                      ) : (
                        <ArrowUpRight className="w-5 h-5 text-status-pending" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Wallet className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-sm font-medium text-foreground truncate">
                          {item.description}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {item.role === "lender" ? "จาก" : "ให้"} {item.partnerName}
                      </p>
                    </div>

                    {/* Amount & Status */}
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-semibold ${
                        item.role === "lender" ? "text-status-paid" : "text-status-pending"
                      }`}>
                        {item.role === "lender" ? "+" : "-"}฿{item.amount.toLocaleString()}
                      </p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusColors[item.status]}`}>
                        {statusLabels[item.status]}
                      </span>
                    </div>
                  </div>

                  {/* Quick Actions for debt items */}
                  {item.type === "debt" && item.status !== "paid" && (
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50">
                      {/* Borrower: Show "ขอเลื่อน" and "ชำระเงิน" buttons like DebtDetail */}
                      {item.role === "borrower" && !item.confirmedByLender && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs h-8 text-muted-foreground"
                            onClick={() => {
                              closePopup();
                              navigate(`/debt/${item.agreementId}?reschedule=${item.id}`);
                            }}
                          >
                            <Clock className="w-3 h-3 mr-1" />
                            ขอเลื่อน
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-8 ml-auto"
                            onClick={() => {
                              closePopup();
                              navigate(`/debt/${item.agreementId}?pay=${item.id}`);
                            }}
                          >
                            <CreditCard className="w-3 h-3 mr-1" />
                            ชำระเงิน
                          </Button>
                        </>
                      )}

                      {/* View slip button for borrower if uploaded */}
                      {item.role === "borrower" && item.paymentProofUrl && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs h-8"
                          onClick={() => void openPreview(item.paymentProofUrl!)}
                        >
                          <Eye className="w-3 h-3 mr-1" />
                          ดูสลิป
                        </Button>
                      )}

                      {/* Lender: View slip button */}
                      {item.role === "lender" && item.paymentProofUrl && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs h-8"
                          onClick={() => void openPreview(item.paymentProofUrl!)}
                        >
                          <Eye className="w-3 h-3 mr-1" />
                          ดูสลิป
                        </Button>
                      )}

                      {/* Lender: Confirm payment */}
                      {item.role === "lender" && item.paymentProofUrl && !item.confirmedByLender && (
                        <Button
                          size="sm"
                          className="text-xs h-8 ml-auto"
                          onClick={() => handleConfirmPayment(item.id)}
                          disabled={confirmingId === item.id}
                        >
                          {confirmingId === item.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <>
                              <Check className="w-3 h-3 mr-1" />
                              ยืนยันรับเงิน
                            </>
                          )}
                        </Button>
                      )}

                      {/* Confirmed indicator */}
                      {item.confirmedByLender && (
                        <span className="text-xs text-status-paid flex items-center gap-1 ml-auto">
                          <Check className="w-3 h-3" />
                          ยืนยันแล้ว
                        </span>
                      )}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>

            {/* Summary */}
            <div className="mt-4 pt-3 border-t border-border">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">รวมทั้งหมด</span>
                <span className="font-heading font-semibold text-lg text-foreground">
                  ฿{selectedDay.amount?.toLocaleString() || 0}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Slip Preview Dialog */}
      <Dialog
        open={loadingPreviewUrl || !!previewUrl}
        onOpenChange={() => {
          setPreviewUrl(null);
          setLoadingPreviewUrl(false);
        }}
      >
        <DialogContent className="max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>สลิปการโอนเงิน</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto mt-4">
            {loadingPreviewUrl ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : previewUrl ? (
              previewUrl.toLowerCase().endsWith('.pdf') ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">ไฟล์ PDF</p>
                  <Button
                    variant="outline"
                    onClick={() => window.open(previewUrl, '_blank')}
                  >
                    เปิดดู PDF
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <img
                    src={previewUrl}
                    alt="Payment slip"
                    className="w-full rounded-lg cursor-zoom-in"
                    style={{ touchAction: 'pinch-zoom' }}
                    onClick={() => window.open(previewUrl, '_blank')}
                  />
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    แตะรูปเพื่อดูขนาดเต็ม
                  </p>
                </div>
              )
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {/* All Upcoming Installments Dialog */}
      <Dialog open={showAllUpcoming} onOpenChange={setShowAllUpcoming}>
        <DialogContent className="max-w-lg mx-4 max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary" />
              งวดใกล้ถึงกำหนดทั้งหมด
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto mt-4 space-y-3">
            {upcomingInstallments.map((item) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-secondary/50 rounded-xl p-3"
              >
                <div className="flex items-center gap-3">
                  {/* Role Icon */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    item.role === "lender" ? "bg-status-paid/10" : "bg-status-pending/10"
                  }`}>
                    {item.role === "lender" ? (
                      <ArrowDownLeft className="w-5 h-5 text-status-paid" />
                    ) : (
                      <ArrowUpRight className="w-5 h-5 text-status-pending" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">
                        {item.partnerName}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusColors[item.status]}`}>
                        {statusLabels[item.status]}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      ครบกำหนด: {formatBangkokDate(item.dueDate!, { day: 'numeric', month: 'short', year: '2-digit' })}
                    </p>
                  </div>

                  {/* Amount */}
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-semibold ${
                      item.role === "lender" ? "text-status-paid" : "text-status-pending"
                    }`}>
                      {item.role === "lender" ? "+" : "-"}฿{item.amount.toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Quick Actions */}
                {item.type === "debt" && item.status !== "paid" && (
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50">
                    {/* View slip button */}
                    {item.paymentProofUrl && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs h-8"
                        onClick={() => void openPreview(item.paymentProofUrl!)}
                      >
                        <Eye className="w-3 h-3 mr-1" />
                        ดูสลิป
                      </Button>
                    )}

                    {/* Borrower: Upload slip */}
                    {item.role === "borrower" && !item.confirmedByLender && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-8 ml-auto"
                        onClick={() => triggerUpload(item.id, item.agreementId)}
                        disabled={uploadingId === item.id}
                      >
                        {uploadingId === item.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <>
                            <Upload className="w-3 h-3 mr-1" />
                            {item.paymentProofUrl ? "อัปโหลดใหม่" : "อัปโหลดสลิป"}
                          </>
                        )}
                      </Button>
                    )}

                    {/* Lender: Confirm payment */}
                    {item.role === "lender" && item.paymentProofUrl && !item.confirmedByLender && (
                      <Button
                        size="sm"
                        className="text-xs h-8 ml-auto"
                        onClick={() => handleConfirmPayment(item.id)}
                        disabled={confirmingId === item.id}
                      >
                        {confirmingId === item.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <>
                            <Check className="w-3 h-3 mr-1" />
                            ยืนยันรับเงิน
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                )}
              </motion.div>
            ))}
            {upcomingInstallments.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <p>ไม่มีงวดที่ใกล้ถึงกำหนดใน 3 วันข้างหน้า</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

import { useCallback, useMemo, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Calendar, Clock, CheckCircle2, AlertCircle, Loader2, FileText, ReceiptText, History, Check, X, CreditCard, XCircle, CalendarClock, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PaymentDialog } from "@/components/PaymentDialog";
import { PaymentSlipUpload } from "@/components/PaymentSlipUpload";
import { RescheduleRequestDialog } from "@/components/RescheduleRequestDialog";
import { RescheduleApprovalCard } from "@/components/RescheduleApprovalCard";

import { BankAccountSection } from "@/components/BankAccountSection";
import { TransferProofSection } from "@/components/TransferProofSection";
import { useDebtAgreements, Installment } from "@/hooks/useDebtAgreements";
import { useRescheduleRequests } from "@/hooks/useRescheduleRequests";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { th } from "date-fns/locale";
import { getUserRoleInAgreement, isInstallmentOverdue, getAgreementDisplayStatus } from "@/domains/debt";
import { generateAgreementPDF, downloadPDF } from "@/utils/pdfExport";
import { divideMoney, roundMoney } from "@/utils/money";
import { PageHeader, PageSection, ReviewPanel, StatusTimeline, type StatusTimelineItem } from "@/components/ux";
import { PageTransition } from "@/components/ux/PageTransition";

export default function DebtDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { getAgreement, isLoading, refresh } = useDebtAgreements();
  const { requests, fetchRequests, loading: rescheduleLoading } = useRescheduleRequests();

  const agreement = getAgreement(id || "");
  const canUseInstallmentActions =
    agreement?.status === 'active' || agreement?.status === 'rescheduling';
  const showTransferProof =
    agreement?.status === 'active' ||
    (agreement?.status === 'pending_confirmation' &&
      Boolean(agreement.contract_finalized_at) &&
      Boolean(agreement.borrower_confirmed));
  
  // State for reschedule dialog
  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState<{ id: string; dueDate: string; interest: number } | null>(null);
  
  
  // State for payment dialog
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [selectedPaymentInstallment, setSelectedPaymentInstallment] = useState<Installment | null>(null);
  
  // Track rejected slip status for each installment
  const [rejectedInstallments, setRejectedInstallments] = useState<Set<string>>(new Set());
  
  // Fetch reschedule requests and rejected slips when agreement loads
  useEffect(() => {
    if (agreement?.id) {
      fetchRequests(agreement.id);
      
      // Fetch rejected slip verifications for this agreement
      const fetchRejectedSlips = async () => {
        const { data } = await supabase
          .from('slip_verifications')
          .select('installment_id')
          .eq('agreement_id', agreement.id)
          .eq('status', 'rejected');
        
        if (data) {
          // Get installments that have rejected slips and are not paid
          const rejectedIds = new Set(data.map(d => d.installment_id));
          setRejectedInstallments(rejectedIds);
        }
      };
      fetchRejectedSlips();
    }
  }, [agreement?.id, fetchRequests]);

  // Handle query params to auto-open dialogs
  useEffect(() => {
    if (!agreement?.installments) return;
    
    const payInstallmentId = searchParams.get('pay');
    const rescheduleInstallmentId = searchParams.get('reschedule');
    const nextSearchParams = new URLSearchParams(searchParams);
    let shouldReplaceSearchParams = false;
    
    if (payInstallmentId) {
      const installment = canUseInstallmentActions
        ? agreement.installments.find(i => i.id === payInstallmentId)
        : null;
      if (installment && installment.status !== 'paid') {
        setSelectedPaymentInstallment(installment);
        setPaymentDialogOpen(true);
      } else {
        setSelectedPaymentInstallment(null);
        setPaymentDialogOpen(false);
      }
      nextSearchParams.delete('pay');
      shouldReplaceSearchParams = true;
    }
    
    if (rescheduleInstallmentId) {
      const installment = agreement.installments.find(i => i.id === rescheduleInstallmentId);
      if (installment && installment.status !== 'paid') {
        setSelectedInstallment({
          id: installment.id,
          dueDate: installment.due_date,
          interest: installment.interest_portion || 0
        });
        setRescheduleDialogOpen(true);
      }
      nextSearchParams.delete('reschedule');
      shouldReplaceSearchParams = true;
    }

    if (shouldReplaceSearchParams) {
      setSearchParams(nextSearchParams, { replace: true });
    }
  }, [agreement?.installments, canUseInstallmentActions, searchParams, setSearchParams]);
  
  // Filter pending requests
  const pendingRequests = useMemo(() => {
    return requests.filter(r => r.status === 'pending');
  }, [requests]);
  
  // Filter completed requests (approved/rejected)
  const completedRequests = useMemo(() => {
    return requests.filter(r => r.status === 'approved' || r.status === 'rejected');
  }, [requests]);
  
  // Calculate comprehensive payment summary from installments
  const paymentSummary = useMemo(() => {
    if (!agreement?.installments) {
      return {
        principal: { paid: 0, pending: 0, total: 0 },
        interest: { paid: 0, pending: 0, total: 0 },
        fee: { paid: 0, pending: 0, total: 0 },
        overall: { paid: 0, pending: 0, total: 0 }
      };
    }
    
    // Regular installments (have principal)
    const regularInstallments = agreement.installments.filter(i => i.principal_portion > 0);
    
    // Fee installments (no principal, only fee/interest)
    const feeInstallments = agreement.installments.filter(i => i.principal_portion === 0 && i.amount > 0);
    
    // Calculate principal
    const principalPaid = regularInstallments
      .filter(i => i.status === 'paid')
      .reduce((sum, i) => sum + i.principal_portion, 0);
    const principalPending = regularInstallments
      .filter(i => i.status !== 'paid' && i.status !== 'rescheduled')
      .reduce((sum, i) => sum + i.principal_portion, 0);
    
    // Calculate interest (from regular installments)
    const interestPaid = regularInstallments
      .filter(i => i.status === 'paid')
      .reduce((sum, i) => sum + (i.interest_portion || 0), 0);
    const interestPending = regularInstallments
      .filter(i => i.status !== 'paid' && i.status !== 'rescheduled')
      .reduce((sum, i) => sum + (i.interest_portion || 0), 0);
    
    // Calculate fee (from fee installments)
    const feePaid = feeInstallments
      .filter(i => i.status === 'paid')
      .reduce((sum, i) => sum + i.amount, 0);
    const feePending = feeInstallments
      .filter(i => i.status !== 'paid' && i.status !== 'rescheduled')
      .reduce((sum, i) => sum + i.amount, 0);
    
    // Overall totals
    const overallPaid = principalPaid + interestPaid + feePaid;
    const overallPending = principalPending + interestPending + feePending;
    
    return {
      principal: { paid: principalPaid, pending: principalPending, total: principalPaid + principalPending },
      interest: { paid: interestPaid, pending: interestPending, total: interestPaid + interestPending },
      fee: { paid: feePaid, pending: feePending, total: feePaid + feePending },
      overall: { paid: overallPaid, pending: overallPending, total: overallPaid + overallPending }
    };
  }, [agreement?.installments]);

  // Keep feeSummary for backward compatibility
  const feeSummary = useMemo(() => paymentSummary.fee, [paymentSummary]);

  // Use domain layer for role determination
  const userRole = useMemo(() => {
    return getUserRoleInAgreement(agreement, user?.id);
  }, [agreement, user?.id]);

  const isLender = userRole === 'lender';
  const isBorrower = userRole === 'borrower';

  // Fetch lender's display name for borrowers
  const [lenderName, setLenderName] = useState<string | null>(null);
  
  useEffect(() => {
    const fetchLenderName = async () => {
      if (agreement && !isLender && agreement.lender_id) {
        const { data } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('user_id', agreement.lender_id)
          .maybeSingle();
        
        if (data?.display_name) {
          setLenderName(data.display_name);
        }
      }
    };
    fetchLenderName();
  }, [agreement, isLender]);

  const partnerName = useMemo(() => {
    if (!agreement) return "";
    if (isLender) {
      return agreement.borrower_name || "ผู้ยืม";
    }
    return lenderName || "ผู้ให้ยืม";
  }, [agreement, isLender, lenderName]);

  const remainingAmount = useMemo(() => {
    return paymentSummary.overall.pending;
  }, [paymentSummary]);

  const defaultPrincipalPerInstallment = agreement
    ? divideMoney(agreement.principal_amount, Math.max(agreement.num_installments, 1))
    : 0;
  const rescheduleFrequency = agreement?.frequency === 'daily' ? 'weekly' : agreement?.frequency;

  const progressPercent = useMemo(() => {
    if (!agreement?.installments || agreement.installments.length === 0) return 0;
    const paidCount = agreement.installments.filter(i => i.status === 'paid').length;
    return (paidCount / agreement.installments.length) * 100;
  }, [agreement]);

  const handleInstallmentClick = (inst: Installment) => {
    if (!canUseInstallmentActions) {
      toast.error("ยังไม่สามารถชำระงวดได้", {
        description: "ต้องรอผู้ให้ยืมอัปโหลดสลิปโอนเงิน และผู้ยืมยืนยันว่าได้รับเงินก่อน",
      });
      return;
    }

    // Only allow clicking on unpaid installments
    if (inst.status === 'paid') return;
    setSelectedPaymentInstallment(inst);
    setPaymentDialogOpen(true);
  };
  
  const handlePaymentSuccess = () => {
    refresh();
  };

  const handleReschedule = (installmentId: string, dueDate: string, interest: number) => {
    setSelectedInstallment({ id: installmentId, dueDate, interest });
    setRescheduleDialogOpen(true);
  };
  
  const handleRescheduleSuccess = () => {
    if (agreement?.id) {
      fetchRequests(agreement.id);
    }
  };

  const [isExporting, setIsExporting] = useState(false);
  
  const handleExport = async () => {
    if (!agreement) return;
    
    setIsExporting(true);
    try {
      // Fetch lender name for PDF
      let lenderFullName = lenderName || "ผู้ให้ยืม";
      if (!lenderName && agreement.lender_id) {
        const { data } = await supabase
          .from('profiles')
          .select('display_name, first_name, last_name')
          .eq('user_id', agreement.lender_id)
          .maybeSingle();
        if (data) {
          lenderFullName = data.first_name && data.last_name 
            ? `${data.first_name} ${data.last_name}`
            : data.display_name || "ผู้ให้ยืม";
        }
      }

      const rescheduleInfo = agreement.interest_type === 'none'
        ? `${agreement.reschedule_fee_rate || 5}% ของเงินต้นต่อหนึ่งงวด (${defaultPrincipalPerInstallment.toLocaleString()} บาท/งวด)`
        : `${agreement.reschedule_interest_multiplier || 1}x ของดอกเบี้ยต่องวด (ประมาณ ${roundMoney((paymentSummary.interest.total / Math.max(agreement.num_installments, 1)) * (agreement.reschedule_interest_multiplier || 1)).toLocaleString(undefined, { maximumFractionDigits: 2 })} บาท/ครั้ง)`;
      
      const pdfData = {
        agreementId: agreement.id,
        agreementStatus: agreement.status,
        principalAmount: agreement.principal_amount,
        totalAmount: agreement.total_amount,
        interestRate: agreement.interest_rate || 0,
        interestType: agreement.interest_type,
        numInstallments: agreement.num_installments,
        frequency: agreement.frequency,
        startDate: agreement.start_date,
        description: agreement.description || undefined,
        
        lenderName: lenderFullName,
        lenderConfirmedAt: agreement.lender_confirmed_at ?? undefined,
        lenderConfirmedIP: agreement.lender_confirmed_ip ?? undefined,
        lenderConfirmedDevice: agreement.lender_confirmed_device ?? undefined,
        
        borrowerName: agreement.borrower_name || "ผู้ยืม",
        borrowerConfirmedAt: agreement.borrower_confirmed_at ?? undefined,
        borrowerConfirmedIP: agreement.borrower_confirmed_ip ?? undefined,
        borrowerConfirmedDevice: agreement.borrower_confirmed_device ?? undefined,

        paymentSummary,
        rescheduleInfo,
        
        installments: (agreement.installments || []).map(inst => ({
          installmentNumber: inst.installment_number,
          dueDate: inst.due_date,
          amount: inst.amount,
          principalAmount: inst.principal_portion,
          interestAmount: inst.principal_portion === 0 ? inst.amount : (inst.interest_portion || 0),
          displayStatus:
            inst.status === 'paid'
              ? 'paid'
              : inst.status === 'rescheduled'
                ? 'rescheduled'
                : rejectedInstallments.has(inst.id) && !inst.payment_proof_url
                  ? 'rejected'
                  : inst.payment_proof_url
                    ? 'verifying'
                    : isInstallmentOverdue(inst)
                      ? 'overdue'
                      : 'pending',
          paidAt: inst.paid_at || undefined,
        })),
      };
      
      const blob = await generateAgreementPDF(pdfData);
      const filename = `agreement-${agreement.id.substring(0, 8)}-${format(new Date(), "yyyyMMdd")}.pdf`;
      downloadPDF(blob, filename);
      
      toast.success("ดาวน์โหลด PDF สำเร็จ!");
    } catch (error) {
      console.error("Error exporting PDF:", error);
      toast.error("เกิดข้อผิดพลาดในการสร้าง PDF");
    } finally {
      setIsExporting(false);
    }
  };

  // Use domain layer for installment status - no direct date comparisons
  const getInstallmentStatus = useCallback((inst: Installment) => {
    if (inst.status === 'paid') return 'paid';
    
    // Check if this installment has rejected slip (and not paid)
    if (rejectedInstallments.has(inst.id) && !inst.payment_proof_url) {
      return 'rejected';
    }
    
    // Use domain function instead of direct date comparison
    if (isInstallmentOverdue(inst)) {
      return 'overdue';
    }
    if (inst.payment_proof_url) {
      return 'pending'; // Has slip, waiting for confirmation
    }
    return 'upcoming';
  }, [rejectedInstallments]);

  const formatDueDate = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), 'd MMM yyyy', { locale: th });
    } catch {
      return dateStr;
    }
  };

  // Sort installments: unpaid/rejected stay in original position (by installment_number),
  // paid ones move to bottom. NOTE: must be declared before early returns to avoid hook order issues.
  const sortedInstallments = useMemo(() => {
    const allInstallments = agreement?.installments || [];
    // Unpaid (including rejected/pending) - keep in original order by installment_number
    const unpaidInstallments = allInstallments
      .filter((i) => i.status !== 'paid')
      .sort((a, b) => a.installment_number - b.installment_number);
    // Paid - move to bottom, also sorted by installment_number
    const paidInstallments = allInstallments
      .filter((i) => i.status === 'paid')
      .sort((a, b) => a.installment_number - b.installment_number);
    return [...unpaidInstallments, ...paidInstallments];
  }, [agreement?.installments]);

  const installmentTimelineItems = useMemo<StatusTimelineItem[]>(() => {
    return sortedInstallments.slice(0, 5).map((inst) => {
      const status = getInstallmentStatus(inst);
      const isFeeInstallment = inst.principal_portion === 0 && inst.amount > 0;

      return {
        id: inst.id,
        title: isFeeInstallment ? "ค่าเลื่อนงวด" : `งวดที่ ${inst.installment_number}`,
        description: `${formatDueDate(inst.due_date)} · ฿${inst.amount.toLocaleString()}`,
        meta:
          status === "paid"
            ? "Paid"
            : status === "overdue"
              ? "Overdue"
              : status === "rejected"
                ? "Rejected"
                : status === "pending"
                  ? "Verifying"
                  : "Pending",
        status:
          status === "paid"
            ? "paid"
            : status === "overdue"
              ? "overdue"
              : status === "rejected"
                ? "rejected"
                : status === "pending"
                  ? "verifying"
                  : "due_soon",
      };
    });
  }, [getInstallmentStatus, sortedInstallments]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-hero flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!agreement) {
    return (
      <div className="min-h-screen bg-gradient-hero flex items-center justify-center">
        <div className="text-center">
          <p className="text-foreground mb-4">ไม่พบข้อตกลงนี้</p>
          <Button onClick={() => navigate("/")}>กลับหน้าหลัก</Button>
        </div>
      </div>
    );
  }

  return (
    <PageTransition>
    <div className="min-h-screen pb-8">
      <div className="page-shell">
        <PageHeader
          title="รายละเอียดข้อตกลง"
          description="ดูสถานะยอดคงเหลือ ตารางงวด หลักฐาน และคำขอที่เกี่ยวข้องในมุมมองเดียว"
          onBack={() => navigate(-1)}
        />

        {/* Partner Info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card rounded-2xl p-5 shadow-card mb-4"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground font-semibold">
                {partnerName.charAt(0)}
              </div>
              <div>
                <p className="font-medium text-foreground">{partnerName}</p>
                <p className="text-sm text-muted-foreground">
                  {isLender ? "คุณให้ยืม" : "คุณยืม"}
                </p>
              </div>
          </div>
            <StatusBadge status={
              agreement.status === 'active' ? 'active' :
              agreement.status === 'pending_confirmation' ? 'pending_confirmation' :
              agreement.status === 'completed' ? 'completed' :
              agreement.status === 'cancelled' ? 'cancelled' :
              'pending_confirmation'
            } />
          </div>

          {agreement.description && (
            <p className="text-sm text-muted-foreground mb-4 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              {agreement.description}
            </p>
          )}

          <div className="text-center py-4 border-y border-border">
            <p className="text-sm text-muted-foreground">ยอดคงเหลือ</p>
            <p className={`text-3xl font-heading font-bold ${isBorrower ? "text-destructive" : "text-foreground"}`}>
              ฿{remainingAmount.toLocaleString()}
            </p>
            <p className="text-sm text-muted-foreground">
              จากทั้งหมด ฿{paymentSummary.overall.total.toLocaleString()}
            </p>
          </div>

          {/* Detailed Payment Summary */}
          <div className="mt-4 space-y-3">
            {/* Principal */}
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">เงินต้น</span>
              <div className="flex items-center gap-2">
                <span className="text-status-paid">
                  จ่ายแล้ว ฿{paymentSummary.principal.paid.toLocaleString()}
                </span>
                <span className="text-muted-foreground">/</span>
                <span className="text-foreground font-medium">
                  ฿{paymentSummary.principal.total.toLocaleString()}
                </span>
              </div>
            </div>
            
            {/* Interest (only show if has interest) */}
            {paymentSummary.interest.total > 0 && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">ดอกเบี้ย</span>
                <div className="flex items-center gap-2">
                  <span className="text-status-paid">
                    จ่ายแล้ว ฿{paymentSummary.interest.paid.toLocaleString()}
                  </span>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-foreground font-medium">
                    ฿{paymentSummary.interest.total.toLocaleString()}
                  </span>
                </div>
              </div>
            )}
            
            {/* Reschedule Fee (only show if has fees) */}
            {paymentSummary.fee.total > 0 && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-amber-600 flex items-center gap-1">
                  <ReceiptText className="w-3 h-3" />
                  ค่าเลื่อนงวด
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-status-paid">
                    จ่ายแล้ว ฿{paymentSummary.fee.paid.toLocaleString()}
                  </span>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-amber-600 font-medium">
                    ฿{paymentSummary.fee.total.toLocaleString()}
                  </span>
                </div>
              </div>
            )}

            {/* Reschedule Fee Rate Info */}
            {agreement.interest_type === 'none' && (
              <div className="flex justify-between items-center text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <ReceiptText className="w-3 h-3" />
                  อัตราค่าเลื่อนงวด
                </span>
                <span>
                  {(agreement.reschedule_fee_rate || 5)}% ของ ฿{defaultPrincipalPerInstallment.toLocaleString()}/งวด
                </span>
              </div>
            )}

            {/* Interest Multiplier Info (for flat/effective rate) */}
            {agreement.interest_type !== 'none' && (
              <div className="flex justify-between items-center text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <ReceiptText className="w-3 h-3" />
                  ค่าเลื่อนงวด (ตัวคูณดอกเบี้ย)
                </span>
                <span>
                  {(agreement.reschedule_interest_multiplier || 1)}x ดอกเบี้ย = ฿{roundMoney((paymentSummary.interest.total / agreement.num_installments) * (agreement.reschedule_interest_multiplier || 1)).toLocaleString(undefined, { maximumFractionDigits: 2 })}/ครั้ง
                </span>
              </div>
            )}

            {/* Overall Summary */}
            <div className="pt-2 border-t border-border/50 flex justify-between items-center text-sm font-medium">
              <span className="text-foreground">รวมชำระแล้ว</span>
              <span className="text-status-paid text-base">
                ฿{paymentSummary.overall.paid.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Progress */}
          <div className="mt-4">
            <div className="h-3 bg-secondary rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.8 }}
                className="h-full bg-primary rounded-full"
              />
            </div>
            <p className="text-sm text-muted-foreground mt-2 text-center">
              ชำระแล้ว {progressPercent.toFixed(0)}%
            </p>
          </div>

        </motion.div>

        <PageSection title="Installment Timeline" description="อ่านสถานะแต่ละงวดแบบต่อเนื่องก่อนลงไปดูรายละเอียดของแต่ละรายการ">
          <StatusTimeline items={installmentTimelineItems} />
        </PageSection>

        {/* Bank Account Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mb-4"
        >
          <BankAccountSection
            agreementId={agreement.id}
            lenderId={agreement.lender_id}
            bankName={agreement.bank_name}
            accountNumber={agreement.account_number}
            accountName={agreement.account_name}
            isLender={isLender}
            onUpdate={refresh}
          />
        </motion.div>

        {/* Transfer Proof Section - Lender's proof of transfer */}
        {showTransferProof && (
          <TransferProofSection
            agreementId={agreement.id}
            transferSlipUrl={agreement.transfer_slip_url || null}
            transferredAt={agreement.transferred_at || null}
            borrowerConfirmedTransfer={agreement.borrower_confirmed_transfer || false}
            borrowerConfirmedTransferAt={agreement.borrower_confirmed_transfer_at || null}
            isLender={isLender}
            isBorrower={isBorrower}
            requiresLenderConfirmationForUpload={agreement.status === 'pending_confirmation'}
            onUpdate={refresh}
          />
        )}

        {/* Installments */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-card rounded-2xl p-5 shadow-card mb-4"
        >
          <h2 className="font-medium text-foreground mb-4">ตารางผ่อนชำระ</h2>
          <div className="space-y-3">
            {sortedInstallments.map((inst, index) => {
              const status = getInstallmentStatus(inst);
              const hasSlip = !!inst.payment_proof_url;
              const isFeeInstallment = inst.principal_portion === 0 && inst.amount > 0;
              const isPaymentDueForCurrentUser =
                isBorrower && canUseInstallmentActions && status !== 'paid' && !hasSlip;
              
              return (
                <motion.div
                  key={inst.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + index * 0.1 }}
                  className={`p-4 rounded-xl border-2 ${
                    status === 'paid'
                      ? "bg-status-paid/10 border-status-paid/30" 
                      : status === 'rejected'
                      ? "bg-destructive/10 border-destructive"
                      : isPaymentDueForCurrentUser
                      ? "bg-destructive/8 border-destructive/30"
                      : isFeeInstallment
                      ? "bg-amber-500/5 border-amber-500/20"
                      : status === 'overdue'
                      ? "bg-status-overdue/10 border-transparent"
                      : status === 'pending'
                      ? "bg-status-pending/10 border-transparent"
                      : "bg-secondary/50 border-transparent"
                  }`}
                >
                  {/* Rejected warning banner */}
                  {status === 'rejected' && (
                    <div className="flex items-center gap-2 mb-3 p-2 rounded-lg bg-destructive/10 text-destructive text-sm">
                      <XCircle className="w-4 h-4 flex-shrink-0" />
                      <span>สลิปถูกปฏิเสธ กรุณาตรวจสอบสลิปหรือยอดเงินอีกครั้ง</span>
                    </div>
                  )}
                  
                  {/* Paid success banner */}
                  {status === 'paid' && inst.confirmed_by_lender && (
                    <div className="flex items-center gap-2 mb-3 p-2 rounded-lg bg-status-paid/10 text-status-paid text-sm">
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                      <span>ชำระเงินสำเร็จ</span>
                    </div>
                  )}

                  {/* Allow both parties to view the slip even after payment is confirmed */}
                  {status === 'paid' && inst.payment_proof_url && (
                    <div className="mb-3">
                      <PaymentSlipUpload
                        agreementId={agreement.id}
                        installmentId={inst.id}
                        currentSlipUrl={inst.payment_proof_url}
                        isLender={isLender}
                        isConfirmedByLender={true}
                        onSlipUploaded={() => {}}
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isPaymentDueForCurrentUser ? (
                        <div className="w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center">
                          {isFeeInstallment ? (
                            <ReceiptText className="w-4 h-4 text-destructive" />
                          ) : (
                            <CreditCard className="w-4 h-4 text-destructive" />
                          )}
                        </div>
                      ) : isFeeInstallment ? (
                        <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center">
                          <ReceiptText className="w-4 h-4 text-amber-600" />
                        </div>
                      ) : status === 'paid' ? (
                        <CheckCircle2 className="w-5 h-5 text-status-paid" />
                      ) : status === 'rejected' ? (
                        <XCircle className="w-5 h-5 text-destructive" />
                      ) : status === 'overdue' ? (
                        <AlertCircle className="w-5 h-5 text-status-overdue" />
                      ) : status === 'pending' ? (
                        <AlertCircle className="w-5 h-5 text-status-pending" />
                      ) : (
                        <Clock className="w-5 h-5 text-muted-foreground" />
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <p className={`font-medium ${isPaymentDueForCurrentUser ? "text-destructive" : "text-foreground"}`}>
                            {isFeeInstallment ? 'ค่าเลื่อนงวด' : `งวดที่ ${inst.installment_number}`}
                          </p>
                          {isFeeInstallment && (
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              isPaymentDueForCurrentUser
                                ? "bg-destructive/10 text-destructive"
                                : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                            }`}>
                              Fee
                            </span>
                          )}
                          {inst.original_due_date && !isFeeInstallment && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-700 dark:text-blue-400">
                              <CalendarClock className="w-3 h-3" />
                              เลื่อนชำระ
                            </span>
                          )}
                        </div>
                        {inst.original_due_date && !isFeeInstallment ? (
                          <div className="text-sm text-muted-foreground">
                            <p className="flex items-center gap-1 line-through text-muted-foreground/60">
                              <Calendar className="w-3 h-3" />
                              {formatDueDate(inst.original_due_date)}
                            </p>
                            <p className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                              <Calendar className="w-3 h-3" />
                              {formatDueDate(inst.due_date)}
                            </p>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDueDate(inst.due_date)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold ${
                        isPaymentDueForCurrentUser
                          ? "text-destructive"
                          : isFeeInstallment
                            ? "text-amber-700 dark:text-amber-400"
                            : "text-foreground"
                      }`}>
                        ฿{inst.amount.toLocaleString()}
                      </p>
                    </div>
                  </div>
                  
                  {/* Actions for non-paid installments */}
                  {status !== 'paid' && (
                    <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between gap-2">
                      {/* Reschedule button for borrowers - only for regular installments */}
                      {isBorrower && canUseInstallmentActions && !isFeeInstallment && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-muted-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleReschedule(inst.id, inst.due_date, inst.interest_portion || 0);
                          }}
                        >
                          <Clock className="w-3 h-3 mr-1" />
                          ขอเลื่อน
                        </Button>
                      )}
                      {isBorrower && !canUseInstallmentActions && !isFeeInstallment && (
                        <span className="text-xs text-muted-foreground">รอยืนยันรับเงินก่อนเริ่มชำระ</span>
                      )}
                      {isFeeInstallment && (
                        <span className="text-xs text-muted-foreground">ไม่สามารถขอเลื่อนได้</span>
                      )}
                      <div className="flex-1 flex justify-end">
                        {/* Lender: only show button when there's a slip to review */}
                        {isLender && inst.payment_proof_url && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs"
                            onClick={() => handleInstallmentClick(inst as Installment)}
                          >
                            <CreditCard className="w-3 h-3 mr-1" />
                            ตรวจสอบสลิป
                          </Button>
                        )}
                        {/* Lender: show waiting status when no slip yet */}
                        {isLender && !inst.payment_proof_url && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs"
                            disabled
                          >
                            <CreditCard className="w-3 h-3 mr-1" />
                            รอกำหนดชำระ
                          </Button>
                        )}
                        {/* Borrower: can pay or view slip */}
                        {isBorrower && canUseInstallmentActions && (
                          <Button
                            size="sm"
                            variant={inst.payment_proof_url ? "ghost" : "outline"}
                            className={`text-xs ${
                              inst.payment_proof_url
                                ? ""
                                : "border-destructive/30 text-destructive hover:border-destructive hover:bg-destructive/10 hover:text-destructive"
                            }`}
                            onClick={() => handleInstallmentClick(inst as Installment)}
                          >
                            {inst.payment_proof_url ? (
                              <>
                                <CreditCard className="w-3 h-3 mr-1" />
                                ดูสลิป
                              </>
                            ) : (
                              <>
                                <CreditCard className="w-3 h-3 mr-1" />
                                ชำระเงิน
                              </>
                            )}
                          </Button>
                        )}
                        {isBorrower && !canUseInstallmentActions && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs"
                            disabled
                          >
                            <CreditCard className="w-3 h-3 mr-1" />
                            ยังชำระไม่ได้
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* Fee Summary Card */}
        {feeSummary.total > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="bg-card rounded-2xl p-5 shadow-card mb-4"
          >
            <h2 className="font-medium text-foreground mb-4 flex items-center gap-2">
              <ReceiptText className="w-4 h-4 text-amber-600" />
              สรุปค่าเลื่อนงวด
            </h2>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 rounded-xl bg-secondary/50">
                <p className="text-xs text-muted-foreground mb-1">รวมทั้งหมด</p>
                <p className="font-semibold text-foreground">฿{feeSummary.total.toLocaleString()}</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-status-paid/10">
                <p className="text-xs text-muted-foreground mb-1">จ่ายแล้ว</p>
                <p className="font-semibold text-status-paid">฿{feeSummary.paid.toLocaleString()}</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-destructive/10">
                <p className="text-xs text-muted-foreground mb-1">ค้างชำระ</p>
                <p className="font-semibold text-destructive">฿{feeSummary.pending.toLocaleString()}</p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Reschedule History */}
        {completedRequests.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-card rounded-2xl p-5 shadow-card mb-4"
          >
            <h2 className="font-medium text-foreground mb-4 flex items-center gap-2">
              <History className="w-4 h-4" />
              ประวัติการขอเลื่อนงวด ({completedRequests.length})
            </h2>
            <div className="space-y-3">
              {completedRequests.map((request) => (
                <div
                  key={request.id}
                  className={`p-3 rounded-xl border ${
                    request.status === 'approved' 
                      ? 'bg-status-paid/5 border-status-paid/20' 
                      : 'bg-red-500/5 border-red-500/20'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {request.status === 'approved' ? (
                        <div className="w-6 h-6 rounded-full bg-status-paid/10 flex items-center justify-center">
                          <Check className="w-3 h-3 text-status-paid" />
                        </div>
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-red-500/10 flex items-center justify-center">
                          <X className="w-3 h-3 text-red-500" />
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {request.status === 'approved' ? 'อนุมัติแล้ว' : 'ถูกปฏิเสธ'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(request.original_due_date), 'd MMM', { locale: th })}
                          {' → '}
                          {format(new Date(request.new_due_date), 'd MMM yyyy', { locale: th })}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-amber-600">
                        ฿{request.reschedule_fee.toLocaleString()}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        อัตรา {request.applied_fee_rate}%
                        {request.safeguard_applied && ' (Safeguard)'}
                      </p>
                    </div>
                  </div>
                  
                  {/* Additional Details */}
                  <div className="mt-2 pt-2 border-t border-border/30 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">ขอเมื่อ: </span>
                      <span className="text-foreground">
                        {format(new Date(request.created_at), 'd MMM yyyy', { locale: th })}
                      </span>
                    </div>
                    {request.status === 'approved' && request.approved_at && (
                      <div>
                        <span className="text-muted-foreground">อนุมัติเมื่อ: </span>
                        <span className="text-foreground">
                          {format(new Date(request.approved_at), 'd MMM yyyy', { locale: th })}
                        </span>
                      </div>
                    )}
                    {request.fee_installments > 1 && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">แบ่งจ่ายค่าเลื่อน: </span>
                        <span className="text-foreground">
                          {request.fee_installments} งวด (งวดละ ฿{request.fee_per_installment.toLocaleString()})
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {request.status === 'rejected' && request.rejection_reason && (
                    <p className="mt-2 text-xs text-red-600 bg-red-500/5 p-2 rounded">
                      เหตุผล: {request.rejection_reason}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Pending Reschedule Requests */}
        {pendingRequests.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
            className="bg-card rounded-2xl p-5 shadow-card mb-4"
          >
            <h2 className="font-medium text-foreground mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              คำขอเลื่อนงวด ({pendingRequests.length})
            </h2>
            <div className="space-y-3">
              {pendingRequests.map((request) => (
                <RescheduleApprovalCard
                  key={request.id}
                  request={request}
                  isLender={isLender}
                  partnerName={partnerName}
                  onUpdate={handleRescheduleSuccess}
                />
              ))}
            </div>
          </motion.div>
        )}

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="space-y-3"
        >
          <Button
            variant="secondary"
            className="w-full"
            onClick={handleExport}
            disabled={isExporting}
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                กำลังสร้าง PDF...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                ส่งออกสรุป PDF
              </>
            )}
          </Button>
        </motion.div>
      </div>
      
      {/* Reschedule Dialog */}
      {selectedInstallment && agreement && (
        <RescheduleRequestDialog
          open={rescheduleDialogOpen}
          onOpenChange={setRescheduleDialogOpen}
          installmentId={selectedInstallment.id}
          agreementId={agreement.id}
          originalDueDate={selectedInstallment.dueDate}
          principalPerInstallment={defaultPrincipalPerInstallment}
          interestPerInstallment={selectedInstallment.interest || 0}
          currentInterestRate={agreement.interest_rate || 0}
          interestType={agreement.interest_type}
          frequency={rescheduleFrequency || 'monthly'}
          defaultFeeRate={agreement.reschedule_fee_rate || 5}
          defaultInterestMultiplier={agreement.reschedule_interest_multiplier || 1}
          onSuccess={handleRescheduleSuccess}
        />
      )}
      
      
      {/* Payment Dialog */}
      {agreement && (
        <PaymentDialog
          open={paymentDialogOpen}
          onOpenChange={setPaymentDialogOpen}
          installment={selectedPaymentInstallment}
          agreement={agreement}
          isLender={isLender}
          onPaymentSubmitted={handlePaymentSuccess}
        />
      )}
    </div>
    </PageTransition>
  );
}

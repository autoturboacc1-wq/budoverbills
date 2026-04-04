import { motion } from "framer-motion";
import { ArrowLeft, FileText, Check, Calendar, Loader2, Download, Sparkles } from "lucide-react";
import { PageTransition } from "@/components/ux/PageTransition";
import { useNavigate } from "react-router-dom";
import { useDebtAgreements } from "@/hooks/useDebtAgreements";
import { useAuth } from "@/contexts/AuthContext";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge, type Status } from "@/components/ui/StatusBadge";

// Domain imports - SINGLE SOURCE OF TRUTH
import { 
  isUserLender, 
  getPartnerName, 
  mapToCompletedAgreements,
  getAgreementDisplayStatus,
  CompletedAgreementData,
  calculateRemainingAmount,
} from "@/domains/debt";

export default function History() {
  const navigate = useNavigate();
  const { agreements, isLoading } = useDebtAgreements();
  const { user } = useAuth();

  const allAgreements = useMemo(() => {
    return [...agreements].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  }, [agreements]);

  const asStatus = (value: unknown): Status | null => {
    const allowed: Status[] = [
      "paid",
      "pending",
      "overdue",
      "negotiating",
      "pending_confirmation",
      "active",
      "completed",
    ];
    return allowed.includes(value as Status) ? (value as Status) : null;
  };

  // Use domain function for completed agreements
  const completedAgreements = useMemo<CompletedAgreementData[]>(() => {
    return mapToCompletedAgreements(agreements, user?.id);
  }, [agreements, user?.id]);

  const borrowerActiveAgreements = useMemo(() => {
    return agreements.filter(
      (agreement) =>
        !isUserLender(agreement, user?.id) &&
        agreement.status === "active" &&
        calculateRemainingAmount(agreement.installments) > 0,
    );
  }, [agreements, user?.id]);

  // Summary stats
  const stats = useMemo(() => {
    return {
      totalCompleted: completedAgreements.length,
      totalPrincipal: completedAgreements.reduce((sum, a) => sum + a.principalAmount, 0),
      totalInterest: completedAgreements.reduce((sum, a) => sum + a.interestPaid, 0),
      totalAmount: completedAgreements.reduce((sum, a) => sum + a.totalAmount, 0),
      asLender: completedAgreements.filter(a => a.isLender).length,
      asBorrower: completedAgreements.filter(a => !a.isLender).length,
    };
  }, [completedAgreements]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("th-TH", {
      day: "numeric",
      month: "short",
      year: "2-digit",
    });
  };

  const handleExportSummary = () => {
    toast.info("ฟีเจอร์ส่งออก PDF กำลังพัฒนา");
  };

  return (
    <PageTransition>
    <div className="min-h-screen bg-gradient-hero pb-24">
      <div className="max-w-lg mx-auto px-4">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between py-4"
        >
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-secondary-foreground" />
            </button>
            <div>
              <h1 className="text-xl font-heading font-semibold text-foreground">
                ประวัติข้อตกลง
              </h1>
              <p className="text-sm text-muted-foreground">ทั้งหมด {agreements.length} รายการ</p>
            </div>
          </div>
          {completedAgreements.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleExportSummary}>
              <Download className="w-4 h-4 mr-1" />
              ส่งออก
            </Button>
          )}
        </motion.header>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <Tabs defaultValue="all" className="w-full">
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="all">ทั้งหมด</TabsTrigger>
              <TabsTrigger value="completed">ปิดสำเร็จ</TabsTrigger>
            </TabsList>

            <TabsContent value="all">
              {borrowerActiveAgreements.length > 1 ? (
                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => navigate("/history/debt-consolidation")}
                  className="mb-4 w-full rounded-2xl border border-primary/15 bg-[linear-gradient(135deg,rgba(14,116,144,0.12),rgba(249,115,22,0.10),rgba(255,255,255,0.55))] p-4 text-left shadow-card transition-transform hover:-translate-y-0.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-background/80 px-3 py-1 text-xs font-medium text-foreground">
                        <Sparkles className="w-3.5 h-3.5 text-primary" />
                        Debt Consolidation
                      </div>
                      <p className="font-heading text-lg font-semibold text-foreground">
                        ลองเทียบแผน Snowball vs Avalanche
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        คุณมีหนี้ฝั่งผู้ยืม {borrowerActiveAgreements.length} ก้อนที่ยังค้างอยู่
                        กดเพื่อดูว่าควรเร่งปิดก้อนไหนก่อน
                      </p>
                    </div>
                    <span className="rounded-full bg-background/80 px-3 py-1 text-xs font-medium text-primary">
                      เปิดเครื่องมือ
                    </span>
                  </div>
                </motion.button>
              ) : null}

              {allAgreements.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-card rounded-2xl p-8 text-center"
                >
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <FileText className="w-8 h-8 text-primary" />
                  </div>
                  <p className="text-foreground font-medium mb-2">ยังไม่มีข้อตกลง</p>
                  <p className="text-sm text-muted-foreground">เมื่อคุณสร้างหรือได้รับข้อตกลง จะแสดงที่นี่</p>
                </motion.div>
              ) : (
                <motion.section
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <div className="space-y-3">
                    {allAgreements.map((agreement, index) => {
                      // Use domain functions for role and status
                      const isLender = isUserLender(agreement, user?.id);
                      const displayStatus = getAgreementDisplayStatus(agreement);
                      const status = asStatus(displayStatus);
                      const name = getPartnerName(agreement, user?.id);
                      
                      return (
                        <motion.button
                          key={agreement.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.1 + index * 0.03 }}
                          onClick={() => navigate(`/debt/${agreement.id}`)}
                          className="w-full bg-card rounded-2xl p-4 shadow-card text-left hover:bg-secondary/30 transition-colors"
                        >
                          <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <FileText className="w-6 h-6 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <p className="font-medium text-foreground truncate">{name}</p>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  {status ? <StatusBadge status={status} size="sm" /> : null}
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                                    {isLender ? "ผู้ให้ยืม" : "ผู้ยืม"}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center justify-between mt-2">
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Calendar className="w-3 h-3" />
                                  <span>{formatDate(agreement.start_date)} • อัปเดต {formatDate(agreement.updated_at)}</span>
                                </div>
                                <p className="font-heading font-semibold text-foreground">
                                  ฿{Number(agreement.total_amount).toLocaleString()}
                                </p>
                              </div>
                            </div>
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                </motion.section>
              )}
            </TabsContent>

            <TabsContent value="completed">
              {completedAgreements.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-card rounded-2xl p-8 text-center"
                >
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <FileText className="w-8 h-8 text-primary" />
                  </div>
                  <p className="text-foreground font-medium mb-2">ยังไม่มีรายการปิดสำเร็จ</p>
                  <p className="text-sm text-muted-foreground">เมื่อข้อตกลงเสร็จสิ้นจะแสดงที่นี่</p>
                </motion.div>
              ) : (
                <>
                  {/* Summary Stats */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-gradient-to-br from-status-paid/20 to-status-paid/5 rounded-2xl p-5 mb-6 border border-status-paid/20"
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full bg-status-paid/20 flex items-center justify-center">
                        <Check className="w-5 h-5 text-status-paid" />
                      </div>
                      <div>
                        <p className="font-heading font-semibold text-foreground">สรุปยอดที่ชำระแล้ว</p>
                        <p className="text-xs text-muted-foreground">ทั้งหมด {stats.totalCompleted} ข้อตกลง</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-card/50 rounded-xl p-3">
                        <p className="text-xs text-muted-foreground">เงินต้น</p>
                        <p className="font-heading font-semibold text-foreground">฿{stats.totalPrincipal.toLocaleString()}</p>
                      </div>
                      <div className="bg-card/50 rounded-xl p-3">
                        <p className="text-xs text-muted-foreground">ดอกเบี้ย</p>
                        <p className="font-heading font-semibold text-foreground">฿{stats.totalInterest.toLocaleString()}</p>
                      </div>
                      <div className="bg-card/50 rounded-xl p-3">
                        <p className="text-xs text-muted-foreground">ผู้ให้ยืม</p>
                        <p className="font-heading font-semibold text-foreground">{stats.asLender} รายการ</p>
                      </div>
                      <div className="bg-card/50 rounded-xl p-3">
                        <p className="text-xs text-muted-foreground">ผู้ยืม</p>
                        <p className="font-heading font-semibold text-foreground">{stats.asBorrower} รายการ</p>
                      </div>
                    </div>
                  </motion.div>

                  {/* Completed Agreements List */}
                  <motion.section
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    <h2 className="font-heading font-semibold text-foreground mb-4">รายการทั้งหมด</h2>
                    <div className="space-y-3">
                      {completedAgreements.map((agreement, index) => (
                        <motion.button
                          key={agreement.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.2 + index * 0.05 }}
                          onClick={() => navigate(`/debt/${agreement.id}`)}
                          className="w-full bg-card rounded-2xl p-4 shadow-card text-left hover:bg-secondary/30 transition-colors"
                        >
                          <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-full bg-status-paid/10 flex items-center justify-center flex-shrink-0">
                              <Check className="w-6 h-6 text-status-paid" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <p className="font-medium text-foreground truncate">{agreement.partnerName}</p>
                                <span className="text-xs px-2 py-0.5 rounded-full bg-status-paid/10 text-status-paid">
                                  {agreement.isLender ? "ผู้ให้ยืม" : "ผู้ยืม"}
                                </span>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                ชำระ {agreement.installmentsPaid}/{agreement.totalInstallments} งวด
                              </p>
                              <div className="flex items-center justify-between mt-2">
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Calendar className="w-3 h-3" />
                                  <span>
                                    {formatDate(agreement.startDate)} - {formatDate(agreement.completedDate)}
                                  </span>
                                </div>
                                <p className="font-heading font-semibold text-foreground">
                                  ฿{agreement.totalAmount.toLocaleString()}
                                </p>
                              </div>
                            </div>
                          </div>
                        </motion.button>
                      ))}
                    </div>
                  </motion.section>

                  {/* Note */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="mt-6 bg-primary/5 rounded-xl p-4 border border-primary/10"
                  >
                    <p className="text-xs text-muted-foreground text-center">
                      📋 เอกสารนี้เป็นบันทึกเพื่อความชัดเจน ไม่ใช่เอกสารทางกฎหมาย
                    </p>
                  </motion.div>
                </>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>

    </div>
    </PageTransition>
  );
}

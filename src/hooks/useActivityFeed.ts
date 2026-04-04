import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatDistanceToNow } from "date-fns";
import { th } from "date-fns/locale";
import { getUserRoleInAgreement } from "@/domains/debt";
import type { DebtAgreement } from "@/domains/debt/types";

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

function parseBangkokDate(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00+07:00`);
}

type ActivityAgreement = Pick<
  DebtAgreement,
  "id" | "borrower_name" | "lender_id" | "borrower_id" | "lender_confirmed" | "borrower_confirmed"
> & {
  principal_amount: number;
  created_at: string;
  status: string;
};

type ActivityInstallment = {
  id: string;
  agreement_id: string;
  installment_number: number;
  amount: number;
  status: string;
  paid_at: string | null;
  payment_proof_url: string | null;
  confirmed_by_lender: boolean | null;
  due_date: string;
  created_at: string;
  debt_agreements_secure: Pick<DebtAgreement, "borrower_name" | "lender_id" | "borrower_id">;
};

export interface ActivityItem {
  id: string;
  type: "agreement_created" | "payment_confirmed" | "payment_uploaded" | "agreement_confirmed" | "payment_due";
  title: string;
  description: string;
  relatedId: string;
  relatedType: "agreement" | "installment";
  timestamp: string;
  timeAgo: string;
}

export function useActivityFeed() {
  const { user } = useAuth();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setActivities([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchActivities = async () => {
      try {
        // Fetch recent debt agreements - use secure view that hides borrower info until confirmed
        const { data: agreements, error: agreementsError } = await supabase
          .from("debt_agreements_secure")
          .select(`
            id,
            borrower_name,
            principal_amount,
            status,
            created_at,
            lender_id,
            borrower_id,
            lender_confirmed,
            borrower_confirmed
          `)
          .or(`lender_id.eq.${user.id},borrower_id.eq.${user.id}`)
          .order("created_at", { ascending: false })
          .limit(20);

        if (agreementsError) throw agreementsError;

        const agreementIds = (agreements as ActivityAgreement[] | null)
          ?.map((agreement) => agreement.id)
          .filter((agreementId): agreementId is string => Boolean(agreementId)) ?? [];

        // Fetch installments for the agreements we already know belong to this user.
        // This avoids PostgREST cross-table filters that can behave inconsistently.
        const installmentsQuery = supabase
          .from("installments")
          .select(`
            id,
            agreement_id,
            installment_number,
            amount,
            status,
            paid_at,
            payment_proof_url,
            confirmed_by_lender,
            due_date,
            created_at,
            debt_agreements_secure!inner (
              borrower_name,
              lender_id,
              borrower_id
            )
          `)
          .order("created_at", { ascending: false })
          .limit(30);

        const { data: installments, error: installmentsError } = agreementIds.length > 0
          ? await installmentsQuery.in("agreement_id", agreementIds)
          : { data: [], error: null };

        if (installmentsError) throw installmentsError;

        const activityList: ActivityItem[] = [];

        // Process agreements
        (agreements as ActivityAgreement[] | null)?.forEach((agreement) => {
          // Use domain layer for role determination
          const userRole = getUserRoleInAgreement(agreement, user.id);
          const isLender = userRole === 'lender';
          const displayName = agreement.borrower_name || "ไม่ระบุ";
          const amount = new Intl.NumberFormat("th-TH").format(agreement.principal_amount);

          activityList.push({
            id: `agreement-${agreement.id}`,
            type: "agreement_created",
            title: isLender ? `สร้างข้อตกลงใหม่` : `ได้รับข้อตกลงใหม่`,
            description: `${displayName} - ฿${amount}`,
            relatedId: agreement.id,
            relatedType: "agreement",
            timestamp: agreement.created_at,
            timeAgo: formatDistanceToNow(new Date(agreement.created_at), {
              addSuffix: true,
              locale: th,
            }),
          });

          // If agreement confirmed
          if (agreement.lender_confirmed && agreement.borrower_confirmed) {
            activityList.push({
              id: `confirmed-${agreement.id}`,
              type: "agreement_confirmed",
              title: "ข้อตกลงได้รับการยืนยัน",
              description: `${displayName} - ฿${amount}`,
              relatedId: agreement.id,
              relatedType: "agreement",
              timestamp: agreement.created_at,
              timeAgo: formatDistanceToNow(new Date(agreement.created_at), {
                addSuffix: true,
                locale: th,
              }),
            });
          }
        });

        // Process installments
        (installments as ActivityInstallment[] | null)?.forEach((installment) => {
          const agreement = installment.debt_agreements_secure;
          // Use domain layer for role determination
          const userRole = getUserRoleInAgreement(agreement, user.id);
          const isLender = userRole === 'lender';
          const displayName = agreement.borrower_name || "ไม่ระบุ";
          const amount = new Intl.NumberFormat("th-TH").format(installment.amount);

          // Payment proof uploaded
          if (installment.payment_proof_url && !installment.confirmed_by_lender) {
            activityList.push({
              id: `uploaded-${installment.id}`,
              type: "payment_uploaded",
              title: isLender ? "รอยืนยันการชำระ" : "อัปโหลดสลิปแล้ว",
              description: `${displayName} งวดที่ ${installment.installment_number} - ฿${amount}`,
              relatedId: installment.agreement_id,
              relatedType: "agreement",
              timestamp: installment.created_at,
              timeAgo: formatDistanceToNow(new Date(installment.created_at), {
                addSuffix: true,
                locale: th,
              }),
            });
          }

          // Payment confirmed
          if (installment.confirmed_by_lender && installment.paid_at) {
            activityList.push({
              id: `paid-${installment.id}`,
              type: "payment_confirmed",
              title: "ยืนยันการชำระสำเร็จ",
              description: `${displayName} งวดที่ ${installment.installment_number} - ฿${amount}`,
              relatedId: installment.agreement_id,
              relatedType: "agreement",
              timestamp: installment.paid_at,
              timeAgo: formatDistanceToNow(new Date(installment.paid_at), {
                addSuffix: true,
                locale: th,
              }),
            });
          }

          // Payment due soon (within 3 days)
          const todayKey = getBangkokDateKey();
          const dueDateMs = getBangkokMidnightTimestamp(installment.due_date);
          const todayMs = getBangkokMidnightTimestamp(todayKey);
          const daysUntilDue = Math.round((dueDateMs - todayMs) / DAY_MS);
          
          if (daysUntilDue >= 0 && daysUntilDue <= 3 && installment.status === "pending") {
            activityList.push({
              id: `due-${installment.id}`,
              type: "payment_due",
              title: daysUntilDue === 0 ? "ครบกำหนดวันนี้" : `ครบกำหนดใน ${daysUntilDue} วัน`,
              description: `${displayName} งวดที่ ${installment.installment_number} - ฿${amount}`,
              relatedId: installment.agreement_id,
              relatedType: "agreement",
              timestamp: installment.due_date,
              timeAgo: formatDistanceToNow(parseBangkokDate(installment.due_date), {
                addSuffix: true,
                locale: th,
              }),
            });
          }
        });

        // Sort by timestamp (most recent first)
        activityList.sort((a, b) => 
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );

        if (!cancelled) {
          setActivities(activityList.slice(0, 20));
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Error fetching activity feed:", error);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void fetchActivities();

    return () => {
      cancelled = true;
    };
  }, [user]);

  return { activities, loading };
}

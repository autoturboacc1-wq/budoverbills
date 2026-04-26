import { motion } from "framer-motion";
import { CreditCard, CheckCircle, Clock, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { PageSection } from "@/components/ux";

interface PendingAction {
  id: string;
  type: "pay" | "confirm" | "extend";
  title: string;
  description: string;
  amount?: number;
  dueDate?: string;
  agreementId: string;
  counterpartyName: string;
  actionUrl: string;
  priority: "critical" | "important" | "info";
}

const priorityConfig = {
  critical: {
    bgClass: "bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-800",
    iconBg: "bg-red-100 dark:bg-red-900/50",
    iconColor: "text-red-600",
  },
  important: {
    bgClass: "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800",
    iconBg: "bg-orange-100 dark:bg-orange-900/50",
    iconColor: "text-orange-600",
  },
  info: {
    bgClass: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800",
    iconBg: "bg-blue-100 dark:bg-blue-900/50",
    iconColor: "text-blue-600",
  },
};

const actionIcons = {
  pay: CreditCard,
  confirm: CheckCircle,
  extend: Clock,
};

export const PendingActionsCard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch pending actions from chat_rooms with has_pending_action = true
  const { data: pendingActions, isLoading } = useQuery({
    queryKey: ["pending-actions", user?.id],
    queryFn: async () => {
      if (!user) return [];

      // Get chat rooms with pending actions for current user
      const { data: rooms, error } = await supabase
        .from("chat_rooms")
        .select(`
          id,
          agreement_id,
          pending_action_type,
          pending_action_for,
          room_type,
          user1_id,
          user2_id
        `)
        .eq("has_pending_action", true)
        .eq("pending_action_for", user.id);

      if (error) {
        console.error("Error fetching pending actions:", error);
        return [];
      }

      if (!rooms || rooms.length === 0) return [];

      // Get agreement details for each room
      const agreementIds = rooms
        .map((room) => room.agreement_id)
        .filter((agreementId): agreementId is string => Boolean(agreementId));

      if (agreementIds.length === 0) return [];

      const { data: agreements, error: aggError } = await supabase
        .from("debt_agreements")
        .select(`
          id,
          principal_amount,
          total_amount,
          borrower_id,
          lender_id,
          status,
          borrower_name,
          lender_confirmed,
          borrower_confirmed,
          borrower_confirmed_transfer,
          transfer_slip_url,
          contract_finalized_at
        `)
        .in("id", agreementIds);

      if (aggError) {
        console.error("Error fetching agreements:", aggError);
        return [];
      }

      // Get installments with due dates
      const { data: installments } = await supabase
        .from("installments")
        .select("agreement_id, due_date, amount, status")
        .in("agreement_id", agreementIds)
        .in("status", ["pending", "overdue", "pending_confirmation"])
        .order("due_date", { ascending: true });

      // Get counterparty profiles
      const counterpartyIds = (agreements ?? [])
        .map((agreement) => (agreement.lender_id === user.id ? agreement.borrower_id : agreement.lender_id))
        .filter((counterpartyId): counterpartyId is string => Boolean(counterpartyId));

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", counterpartyIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p.display_name]) || []);

      // Build pending actions
      const actions: PendingAction[] = rooms.map(room => {
        const agreement = agreements?.find(a => a.id === room.agreement_id);
        if (!agreement) return null;

        const nextInstallment = installments?.find(i => i.agreement_id === room.agreement_id);
        const counterpartyId = agreement.lender_id === user.id ? agreement.borrower_id : agreement.lender_id;
        const counterpartyName = profileMap.get(counterpartyId || "") || agreement.borrower_name || "ไม่ระบุชื่อ";

        const isOverdue = nextInstallment?.status === "overdue";
        const priority: "critical" | "important" | "info" = isOverdue ? "critical" : 
          room.pending_action_type === "pay" ? "important" : "info";

        let title = "";
        let description = "";

        switch (room.pending_action_type) {
          case "pay":
            title = isOverdue ? "ค้างชำระ!" : "ต้องชำระเงิน";
            description = `กับ ${counterpartyName}`;
            break;
          case "confirm":
            if (!agreement.contract_finalized_at) {
              title = "ต้องลงนามสัญญา";
              description = `กับ ${counterpartyName}`;
            } else if (!agreement.borrower_confirmed) {
              title = "รอยอมรับข้อตกลง";
              description = `จาก ${counterpartyName}`;
            } else if (!agreement.lender_confirmed) {
              title = "รอโอนและอัปโหลดสลิป";
              description = `${counterpartyName} ยอมรับแล้ว`;
            } else if (agreement.transfer_slip_url && !agreement.borrower_confirmed_transfer) {
              title = "รอยืนยันรับเงิน";
              description = `${counterpartyName} อัปโหลดสลิปแล้ว`;
            } else {
              title = "รอยืนยัน";
              description = `กับ ${counterpartyName}`;
            }
            break;
          case "extend":
            title = "มีคำขอเลื่อนกำหนด";
            description = `จาก ${counterpartyName}`;
            break;
        }

        return {
          id: room.id,
          type: room.pending_action_type as "pay" | "confirm" | "extend",
          title,
          description,
          amount: nextInstallment?.amount || agreement.principal_amount,
          dueDate: nextInstallment?.due_date,
          agreementId: room.agreement_id!,
          counterpartyName,
          actionUrl:
            room.pending_action_type === "confirm" && !agreement.contract_finalized_at
              ? `/agreement/${room.agreement_id}/contract`
              : room.pending_action_type === "confirm" &&
                  agreement.borrower_confirmed &&
                  agreement.lender_confirmed &&
                  agreement.transfer_slip_url &&
                  !agreement.borrower_confirmed_transfer
                ? `/debt/${room.agreement_id}`
                : room.pending_action_type === "confirm"
                  ? `/agreement/${room.agreement_id}/confirm`
                  : `/debt/${room.agreement_id}`,
          priority,
        };
      }).filter(Boolean) as PendingAction[];

      // Sort by priority
      return actions.sort((a, b) => {
        const priorityOrder = { critical: 0, important: 1, info: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });
    },
    enabled: !!user,
  });

  const agreementIds = useMemo(() => {
    const uniqueIds = new Set(
      (pendingActions || []).map((action) => action.agreementId).filter(Boolean)
    );
    return Array.from(uniqueIds);
  }, [pendingActions]);

  useEffect(() => {
    if (!user?.id) return;

    const invalidatePendingActions = () => {
      void queryClient.invalidateQueries({ queryKey: ["pending-actions", user.id] });
    };

    const channels: Array<ReturnType<typeof supabase.channel>> = [];

    const chatRoomsChannel = supabase
      .channel(`pending-actions-${user.id}-chat-rooms`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_rooms",
          filter: `pending_action_for=eq.${user.id}`,
        },
        invalidatePendingActions
      )
      .subscribe();

    channels.push(chatRoomsChannel);

    const debtAgreementsChannel = supabase
      .channel(`pending-actions-${user.id}-debt-agreements`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "debt_agreements",
          filter: `lender_id=eq.${user.id}`,
        },
        invalidatePendingActions
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "debt_agreements",
          filter: `borrower_id=eq.${user.id}`,
        },
        invalidatePendingActions
      )
      .subscribe();

    channels.push(debtAgreementsChannel);

    agreementIds.forEach((agreementId) => {
      const installmentsChannel = supabase
        .channel(`pending-actions-${user.id}-installments-${agreementId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "installments",
            filter: `agreement_id=eq.${agreementId}`,
          },
          invalidatePendingActions
        )
        .subscribe();

      channels.push(installmentsChannel);
    });

    return () => {
      channels.forEach((channel) => {
        void supabase.removeChannel(channel);
      });
    };
  }, [agreementIds, queryClient, user?.id]);

  if (isLoading) {
    return null;
  }

  if (!pendingActions || pendingActions.length === 0) {
    return null;
  }

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat("th-TH").format(amount);
  };

  return (
    <PageSection
      title="ต้องทำ"
      action={
        <span className="rounded-full border border-destructive/15 bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive">
          {pendingActions.length} รายการ
        </span>
      }
    >
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
        {pendingActions.map((action, index) => {
          const Icon = actionIcons[action.type];
          const config = priorityConfig[action.priority];

          return (
            <motion.button
              key={action.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              onClick={() => navigate(action.actionUrl)}
              className={`w-full rounded-[1.1rem] border p-3 text-left transition-colors ${config.bgClass}`}
            >
              <div className="flex items-center gap-3">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${config.iconBg}`}>
                  <Icon className={`w-4 h-4 ${config.iconColor}`} />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-medium ${config.iconColor}`}>
                      {action.title}
                    </span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {action.description}
                  </p>
                </div>

                {action.amount && (
                  <div className="text-right">
                    <p className={`text-sm font-semibold ${config.iconColor}`}>
                      ฿{formatAmount(action.amount)}
                    </p>
                    {action.dueDate && (
                      <p className="text-xs text-muted-foreground">
                        {new Date(action.dueDate).toLocaleDateString("th-TH", { 
                          day: "numeric", 
                          month: "short" 
                        })}
                      </p>
                    )}
                  </div>
                )}

                <ChevronRight className={`w-5 h-5 flex-shrink-0 ${config.iconColor}`} />
              </div>
            </motion.button>
          );
        })}
      </motion.div>
    </PageSection>
  );
};

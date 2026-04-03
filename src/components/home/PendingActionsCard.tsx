import { motion } from "framer-motion";
import { CreditCard, CheckCircle, Clock, AlertTriangle, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";

interface PendingAction {
  id: string;
  type: "pay" | "confirm" | "extend";
  title: string;
  description: string;
  amount?: number;
  dueDate?: string;
  agreementId: string;
  counterpartyName: string;
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
          borrower_name
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
            title = "รอยืนยันการรับเงิน";
            description = `${counterpartyName} ชำระแล้ว`;
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
    return (
      <div className="mb-6 bg-card rounded-2xl p-4 shadow-card">
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!pendingActions || pendingActions.length === 0) return null;

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat("th-TH").format(amount);
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6"
    >
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-5 h-5 text-red-500" />
        <h2 className="font-heading font-semibold text-lg text-foreground">
          สิ่งที่ต้องทำ
        </h2>
        <span className="px-2 py-0.5 text-xs font-medium bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400 rounded-full">
          {pendingActions.length}
        </span>
      </div>

      <div className="space-y-3">
        {pendingActions.map((action, index) => {
          const Icon = actionIcons[action.type];
          const config = priorityConfig[action.priority];

          return (
            <motion.button
              key={action.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              onClick={() => navigate(`/debt/${action.agreementId}`)}
              className={`w-full p-4 rounded-xl border text-left transition-all hover:scale-[1.01] ${config.bgClass}`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${config.iconBg}`}>
                  <Icon className={`w-6 h-6 ${config.iconColor}`} />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-semibold ${config.iconColor}`}>
                      {action.title}
                    </span>
                    {action.priority === "critical" && (
                      <span className="px-1.5 py-0.5 text-[10px] font-bold bg-red-500 text-white rounded-full animate-pulse">
                        ด่วน!
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground truncate">
                    {action.description}
                  </p>
                </div>

                {action.amount && (
                  <div className="text-right">
                    <p className={`font-bold ${config.iconColor}`}>
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
      </div>
    </motion.section>
  );
};

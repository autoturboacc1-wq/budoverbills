import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CheckCircle, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageTransition } from "@/components/ux/PageTransition";
import { supabase } from "@/integrations/supabase/client";
import { useDebtAgreements } from "@/hooks/useDebtAgreements";
import { toast } from "sonner";
import { getErrorMessage } from "@/utils/errorHandler";

type ClaimInviteResult = {
  success?: boolean;
  agreement_id?: string;
};

type RpcClient = (
  fn: string,
  params?: Record<string, unknown>
) => Promise<{ data: unknown; error: Error | null }>;

export default function AgreementInvite() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { refresh } = useDebtAgreements();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("กำลังตรวจสอบลิงก์เชิญ");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("ลิงก์เชิญไม่ถูกต้อง");
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const rpc = supabase.rpc.bind(supabase) as unknown as RpcClient;
        const { data, error } = await rpc("claim_agreement_invitation", {
          p_invitation_token: token,
        });

        if (error) {
          throw error;
        }

        const result = (data ?? {}) as ClaimInviteResult;
        if (!result.success || !result.agreement_id) {
          throw new Error("Invalid invitation response");
        }

        await refresh();

        if (cancelled) {
          return;
        }

        setStatus("success");
        setMessage("ผูกบัญชีผู้ยืมสำเร็จ");
        toast.success("ผูกบัญชีผู้ยืมสำเร็จ");
        navigate(`/agreement/${result.agreement_id}/confirm`, { replace: true });
      } catch (error) {
        if (cancelled) {
          return;
        }

        console.error("Claim agreement invitation error:", error);
        setStatus("error");
        setMessage(getErrorMessage(error, "ลิงก์เชิญไม่ถูกต้องหรือถูกใช้ไปแล้ว"));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate, refresh, token]);

  return (
    <PageTransition>
      <div className="min-h-screen bg-background px-4 py-10">
        <div className="mx-auto flex max-w-md flex-col items-center rounded-2xl border border-border/80 bg-card p-6 text-center shadow-card">
          {status === "loading" ? (
            <Loader2 className="mb-4 h-10 w-10 animate-spin text-primary" aria-hidden="true" />
          ) : status === "success" ? (
            <CheckCircle className="mb-4 h-10 w-10 text-status-paid" aria-hidden="true" />
          ) : (
            <XCircle className="mb-4 h-10 w-10 text-destructive" aria-hidden="true" />
          )}
          <h1 className="text-xl font-heading font-semibold text-foreground">ลิงก์เชิญยืนยันข้อตกลง</h1>
          <p className="mt-2 text-sm text-muted-foreground">{message}</p>
          {status === "error" ? (
            <Button type="button" className="mt-6 w-full" onClick={() => navigate("/")}>
              กลับหน้าแรก
            </Button>
          ) : null}
        </div>
      </div>
    </PageTransition>
  );
}

import { useState, useEffect, forwardRef } from "react";
import { Building, Pencil, Check, X, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { THAI_BANKS } from "@/constants/thaibanks";
import { useAuth } from "@/contexts/AuthContext";

interface BankAccountData {
  bank_name: string | null;
  account_number: string | null;
  account_name: string | null;
}

export const ProfileBankAccount = forwardRef<HTMLDivElement, object>(function ProfileBankAccount(props, ref) {
  const { user } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bankData, setBankData] = useState<BankAccountData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [formData, setFormData] = useState({
    bankName: "",
    accountNumber: "",
    accountName: "",
  });

  // Fetch bank account from the most recent agreement where user is lender
  const fetchBankAccount = async () => {
    if (!user?.id) return;
    
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();

      // For now, we'll store in local state or get from most recent agreement
      const { data: agreement, error: agrError } = await supabase
        .from("debt_agreements")
        .select("bank_name, account_number, account_name")
        .eq("lender_id", user.id)
        .not("bank_name", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (agreement) {
        setBankData(agreement);
        setFormData({
          bankName: agreement.bank_name || "",
          accountNumber: agreement.account_number || "",
          accountName: agreement.account_name || "",
        });
      }
    } catch (error) {
      console.error("Error fetching bank account:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBankAccount();
  }, [user?.id]);

  const handleSave = async () => {
    if (!user?.id) {
      toast.error("กรุณาเข้าสู่ระบบก่อน");
      return;
    }

    if (!formData.bankName || !formData.accountNumber || !formData.accountName) {
      toast.error("กรุณากรอกข้อมูลให้ครบ");
      return;
    }

    setIsSubmitting(true);
    try {
      // Update all active agreements where user is lender
      const { error } = await supabase
        .from("debt_agreements")
        .update({
          bank_name: formData.bankName,
          account_number: formData.accountNumber,
          account_name: formData.accountName,
        })
        .eq("lender_id", user.id);

      if (error) throw error;

      setBankData({
        bank_name: formData.bankName,
        account_number: formData.accountNumber,
        account_name: formData.accountName,
      });

      toast.success("อัปเดตบัญชีรับเงินแล้ว");
      setIsEditing(false);
    } catch (error) {
      console.error("Error updating bank account:", error);
      toast.error("เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getBankLabel = (value: string) => {
    return THAI_BANKS.find((b) => b.value === value)?.label || value;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("คัดลอกแล้ว");
  };

  const hasBankAccount = bankData?.bank_name && bankData?.account_number && bankData?.account_name;

  if (isLoading) {
    return (
      <div className="bg-card rounded-2xl p-5 shadow-card mb-6 animate-pulse">
        <div className="h-4 bg-muted rounded w-1/3 mb-4"></div>
        <div className="h-20 bg-muted rounded"></div>
      </div>
    );
  }

  const openEdit = () => {
    setFormData({
      bankName: bankData?.bank_name || "",
      accountNumber: bankData?.account_number || "",
      accountName: bankData?.account_name || "",
    });
    setIsEditing(true);
  };

  return (
    <div ref={ref}>
      <div 
        className="bg-card rounded-2xl p-5 shadow-card mb-6 cursor-pointer hover:bg-secondary/30 transition-colors"
        onClick={openEdit}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-foreground font-medium">
            <Building className="w-5 h-5 text-primary" />
            <span>บัญชีรับเงิน</span>
          </div>
          <Pencil className="w-4 h-4 text-muted-foreground" />
        </div>

        {hasBankAccount ? (
          <div className="space-y-2 text-sm bg-primary/5 border border-primary/20 rounded-xl p-4">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">ธนาคาร</span>
              <span className="font-medium text-foreground">
                {getBankLabel(bankData.bank_name!)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">
                {bankData.bank_name === "promptpay" ? "พร้อมเพย์" : "เลขบัญชี"}
              </span>
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground font-mono">
                  {bankData.account_number}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    copyToClipboard(bankData.account_number!);
                  }}
                  className="p-1 hover:bg-primary/10 rounded"
                >
                  <Copy className="w-3 h-3 text-primary" />
                </button>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">ชื่อบัญชี</span>
              <span className="font-medium text-foreground">{bankData.account_name}</span>
            </div>
            <p className="text-xs text-muted-foreground pt-2 border-t border-border mt-2">
              ข้อมูลนี้จะใช้ตอนสร้างข้อตกลงใหม่
            </p>
          </div>
        ) : (
          <div className="p-4 bg-secondary/50 rounded-xl text-center">
            <p className="text-sm text-muted-foreground mb-2">
              ยังไม่ได้ตั้งค่าบัญชีรับเงิน
            </p>
            <p className="text-xs text-muted-foreground">
              แตะที่นี่เพื่อตั้งค่าบัญชีสำหรับรับชำระเงิน
            </p>
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent className="max-w-md mx-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building className="w-5 h-5 text-primary" />
              ตั้งค่าบัญชีรับเงิน
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              ข้อมูลนี้จะใช้เมื่อคุณสร้างข้อตกลงในฐานะผู้ให้ยืม
            </p>
            
            <div className="space-y-2">
              <Label>ธนาคาร</Label>
              <Select
                value={formData.bankName}
                onValueChange={(value) =>
                  setFormData({ ...formData, bankName: value })
                }
              >
                <SelectTrigger className="rounded-xl">
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
              <Label>
                {formData.bankName === "promptpay"
                  ? "หมายเลขพร้อมเพย์"
                  : "เลขบัญชี"}
              </Label>
              <Input
                value={formData.accountNumber}
                onChange={(e) =>
                  setFormData({ ...formData, accountNumber: e.target.value })
                }
                placeholder={
                  formData.bankName === "promptpay"
                    ? "0812345678"
                    : "123-4-56789-0"
                }
              />
            </div>

            <div className="space-y-2">
              <Label>ชื่อบัญชี</Label>
              <Input
                value={formData.accountName}
                onChange={(e) =>
                  setFormData({ ...formData, accountName: e.target.value })
                }
                placeholder="ชื่อ-นามสกุล ตามบัญชี"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setIsEditing(false)}
                disabled={isSubmitting}
              >
                <X className="w-4 h-4 mr-1" />
                ยกเลิก
              </Button>
              <Button
                className="flex-1"
                onClick={handleSave}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  "กำลังบันทึก..."
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-1" />
                    บันทึก
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
});

ProfileBankAccount.displayName = "ProfileBankAccount";

import { useState } from "react";
import { Building, Pencil, Check, X } from "lucide-react";
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
import { getBankAccountError, normalizeBankAccountForStorage } from "@/lib/validation";

interface BankAccountSectionProps {
  agreementId: string;
  lenderId: string;
  bankName?: string | null;
  accountNumber?: string | null;
  accountName?: string | null;
  isLender: boolean;
  onUpdate: () => void;
}

export function BankAccountSection({
  agreementId,
  lenderId,
  bankName,
  accountNumber,
  accountName,
  isLender,
  onUpdate,
}: BankAccountSectionProps) {
  const { user } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    bankName: bankName || "",
    accountNumber: accountNumber || "",
    accountName: accountName || "",
  });
  const [accountError, setAccountError] = useState<string | null>(null);
  const canEditBankAccount = isLender && user?.id === lenderId;

  const handleSave = async () => {
    if (!canEditBankAccount) {
      toast.error("คุณไม่มีสิทธิ์แก้ไขบัญชีรับเงินนี้");
      return;
    }

    if (!formData.bankName || !formData.accountNumber || !formData.accountName) {
      const message = "กรุณากรอกข้อมูลให้ครบ";
      setAccountError(message);
      toast.error(message);
      return;
    }

    const validationError = getBankAccountError(formData.bankName, formData.accountNumber);
    if (validationError) {
      setAccountError(validationError);
      toast.error(validationError);
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase
        .from("debt_agreements")
        .update({
          bank_name: formData.bankName,
          account_number: normalizeBankAccountForStorage(formData.bankName, formData.accountNumber),
          account_name: formData.accountName,
        })
        .eq("id", agreementId)
        .eq("lender_id", lenderId)
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        throw new Error("ไม่พบรายการที่คุณมีสิทธิ์แก้ไข");
      }

      toast.success("อัปเดตบัญชีรับเงินแล้ว");
      setAccountError(null);
      setIsEditing(false);
      onUpdate();
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

  const hasBankAccount = bankName && accountNumber && accountName;

  return (
    <>
      <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-primary font-medium">
            <Building className="w-4 h-4" />
            <span>บัญชีรับเงิน</span>
          </div>
          {canEditBankAccount && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setFormData({
                  bankName: bankName || "",
                  accountNumber: accountNumber || "",
                  accountName: accountName || "",
                });
                setAccountError(null);
                setIsEditing(true);
              }}
            >
              <Pencil className="w-3 h-3 mr-1" />
              {hasBankAccount ? "แก้ไข" : "เพิ่ม"}
            </Button>
          )}
        </div>

        {hasBankAccount ? (
          <div className="space-y-1 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">ธนาคาร</span>
              <span className="font-medium text-foreground">
                {getBankLabel(bankName)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">
                {bankName === "promptpay" ? "พร้อมเพย์" : "เลขบัญชี"}
              </span>
              <span className="font-medium text-foreground font-mono">
                {accountNumber}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">ชื่อบัญชี</span>
              <span className="font-medium text-foreground">{accountName}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {isLender
              ? "ยังไม่ได้ตั้งค่าบัญชีรับเงิน กด 'เพิ่ม' เพื่อตั้งค่า"
              : "เจ้าหนี้ยังไม่ได้ตั้งค่าบัญชีรับเงิน"}
          </p>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent className="max-w-md mx-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building className="w-5 h-5 text-primary" />
              แก้ไขบัญชีรับเงิน
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>ธนาคาร</Label>
              <Select
                value={formData.bankName}
                onValueChange={(value) => {
                  setFormData({ ...formData, bankName: value });
                  setAccountError(null);
                }}
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
                onChange={(e) => {
                  setFormData({ ...formData, accountNumber: e.target.value });
                  setAccountError(null);
                }}
                placeholder={
                  formData.bankName === "promptpay"
                    ? "0812345678"
                    : "123-4-56789-0"
                }
                inputMode="numeric"
              />
            </div>
            {accountError ? (
              <p className="text-xs text-destructive -mt-2">{accountError}</p>
            ) : null}

            <div className="space-y-2">
              <Label>ชื่อบัญชี</Label>
              <Input
                value={formData.accountName}
                onChange={(e) => {
                  setFormData({ ...formData, accountName: e.target.value });
                  setAccountError(null);
                }}
                placeholder="ชื่อ-นามสกุล ตามบัญชี"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setAccountError(null);
                  setIsEditing(false);
                }}
                disabled={isSubmitting}
              >
                <X className="w-4 h-4 mr-1" />
                ยกเลิก
              </Button>
              <Button
                className="flex-1"
                onClick={handleSave}
                disabled={isSubmitting || !canEditBankAccount}
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
    </>
  );
}

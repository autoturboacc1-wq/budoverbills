import { useState, useEffect, useCallback, forwardRef } from "react";
import { Building, Check, Copy, Loader2, Pencil, Plus, Star, Trash2, X } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { THAI_BANKS } from "@/constants/thaibanks";
import { useAuth } from "@/contexts/AuthContext";
import { getBankAccountError, normalizeBankAccountForStorage } from "@/lib/validation";

interface SavedBankAccount {
  id: string;
  user_id: string;
  label: string | null;
  bank_name: string;
  account_number: string;
  account_name: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

const emptyForm = {
  label: "",
  bankName: "",
  accountNumber: "",
  accountName: "",
  isDefault: true,
};

function getProfileAccountName(profile: ReturnType<typeof useAuth>["profile"]): string {
  return [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
}

export const ProfileBankAccount = forwardRef<HTMLDivElement, object>(function ProfileBankAccount(_props, ref) {
  const { user, profile } = useAuth();
  const [accounts, setAccounts] = useState<SavedBankAccount[]>([]);
  const [editingAccount, setEditingAccount] = useState<SavedBankAccount | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [formData, setFormData] = useState(emptyForm);
  const [accountError, setAccountError] = useState<string | null>(null);
  const profileAccountName = getProfileAccountName(profile);

  const fetchBankAccounts = useCallback(async () => {
    if (!user?.id) {
      setAccounts([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("user_bank_accounts")
        .select("id, user_id, label, bank_name, account_number, account_name, is_default, created_at, updated_at")
        .eq("user_id", user.id)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAccounts(data || []);
    } catch (error) {
      console.error("Error fetching bank accounts:", error);
      toast.error("โหลดบัญชีรับเงินไม่สำเร็จ");
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchBankAccounts();
  }, [fetchBankAccounts]);

  const getBankLabel = (value: string) => {
    return THAI_BANKS.find((bank) => bank.value === value)?.label || value;
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success("คัดลอกแล้ว");
  };

  const resetDialog = () => {
    setEditingAccount(null);
    setFormData(emptyForm);
    setAccountError(null);
  };

  const openCreate = () => {
    setEditingAccount(null);
    setFormData({
      ...emptyForm,
      accountName: profileAccountName,
      isDefault: accounts.length === 0,
    });
    setAccountError(null);
    setIsDialogOpen(true);
  };

  const openEdit = (account: SavedBankAccount) => {
    setEditingAccount(account);
    setFormData({
      label: account.label || "",
      bankName: account.bank_name,
      accountNumber: account.account_number,
      accountName: profileAccountName,
      isDefault: account.is_default,
    });
    setAccountError(null);
    setIsDialogOpen(true);
  };

  const clearDefaultAccounts = async () => {
    if (!user?.id) return;

    const { error } = await supabase
      .from("user_bank_accounts")
      .update({ is_default: false })
      .eq("user_id", user.id);

    if (error) throw error;
  };

  const handleSave = async () => {
    if (!user?.id) {
      toast.error("กรุณาเข้าสู่ระบบก่อน");
      return;
    }

    if (!profileAccountName) {
      const message = "กรุณากรอกชื่อจริงและนามสกุลในโปรไฟล์ก่อนเพิ่มบัญชีรับเงิน";
      setAccountError(message);
      toast.error(message);
      return;
    }

    if (!formData.bankName || !formData.accountNumber) {
      const message = "กรุณากรอกข้อมูลบัญชีให้ครบ";
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

    const normalizedAccountNumber = normalizeBankAccountForStorage(formData.bankName, formData.accountNumber);

    setIsSubmitting(true);
    try {
      if (formData.isDefault || accounts.length === 0) {
        await clearDefaultAccounts();
      }

      if (editingAccount) {
        const { error } = await supabase
          .from("user_bank_accounts")
          .update({
            label: formData.label.trim() || null,
            bank_name: formData.bankName,
            account_number: normalizedAccountNumber,
            account_name: profileAccountName,
            is_default: formData.isDefault || accounts.length === 1,
          })
          .eq("id", editingAccount.id)
          .eq("user_id", user.id);

        if (error) throw error;
        toast.success("อัปเดตบัญชีรับเงินแล้ว");
      } else {
        const { error } = await supabase
          .from("user_bank_accounts")
          .insert({
            user_id: user.id,
            label: formData.label.trim() || null,
            bank_name: formData.bankName,
            account_number: normalizedAccountNumber,
            account_name: profileAccountName,
            is_default: formData.isDefault || accounts.length === 0,
          });

        if (error) throw error;
        toast.success("เพิ่มบัญชีรับเงินแล้ว");
      }

      await fetchBankAccounts();
      setIsDialogOpen(false);
      resetDialog();
    } catch (error) {
      console.error("Error saving bank account:", error);
      toast.error("บันทึกบัญชีรับเงินไม่สำเร็จ");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSetDefault = async (account: SavedBankAccount) => {
    if (!user?.id || account.is_default) return;

    setIsSubmitting(true);
    try {
      await clearDefaultAccounts();

      const { error } = await supabase
        .from("user_bank_accounts")
        .update({ is_default: true })
        .eq("id", account.id)
        .eq("user_id", user.id);

      if (error) throw error;

      await fetchBankAccounts();
      toast.success("ตั้งเป็นบัญชีหลักแล้ว");
    } catch (error) {
      console.error("Error setting default bank account:", error);
      toast.error("ตั้งบัญชีหลักไม่สำเร็จ");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (account: SavedBankAccount) => {
    if (!user?.id) return;
    if (!window.confirm("ลบบัญชีรับเงินนี้หรือไม่?")) return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from("user_bank_accounts")
        .delete()
        .eq("id", account.id)
        .eq("user_id", user.id);

      if (error) throw error;

      const remainingAccounts = accounts.filter((item) => item.id !== account.id);
      if (account.is_default && remainingAccounts.length > 0) {
        const nextDefault = remainingAccounts[0];
        const { error: defaultError } = await supabase
          .from("user_bank_accounts")
          .update({ is_default: true })
          .eq("id", nextDefault.id)
          .eq("user_id", user.id);

        if (defaultError) throw defaultError;
      }

      await fetchBankAccounts();
      toast.success("ลบบัญชีรับเงินแล้ว");
    } catch (error) {
      console.error("Error deleting bank account:", error);
      toast.error("ลบบัญชีรับเงินไม่สำเร็จ");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-card rounded-2xl p-5 shadow-card mb-6 animate-pulse">
        <div className="h-4 bg-muted rounded w-1/3 mb-4" />
        <div className="h-24 bg-muted rounded" />
      </div>
    );
  }

  return (
    <div ref={ref}>
      <div className="bg-card rounded-2xl p-5 shadow-card mb-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-start gap-2">
            <Building className="w-5 h-5 text-primary mt-0.5" />
            <div>
              <h3 className="font-medium text-foreground">ตั้งค่าบัญชีรับเงิน</h3>
              <p className="text-xs text-muted-foreground">
                ใช้เมื่อคุณสร้างข้อตกลงในฐานะผู้ให้ยืม
              </p>
            </div>
          </div>
          <Button type="button" size="sm" className="gap-1" onClick={openCreate}>
            <Plus className="w-4 h-4" aria-hidden="true" />
            เพิ่มบัญชี
          </Button>
        </div>

        {accounts.length > 0 ? (
          <div className="space-y-3">
            {accounts.map((account) => (
              <div
                key={account.id}
                className="rounded-xl border border-border/80 bg-background/70 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">
                        {account.label || getBankLabel(account.bank_name)}
                      </p>
                      {account.is_default ? (
                        <Badge variant="secondary" className="gap-1">
                          <Star className="h-3 w-3" aria-hidden="true" />
                          บัญชีหลัก
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {getBankLabel(account.bank_name)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(account)}
                      aria-label="แก้ไขบัญชีรับเงิน"
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(account)}
                      disabled={isSubmitting}
                      aria-label="ลบบัญชีรับเงิน"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>

                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <div className="rounded-lg bg-secondary/40 p-3">
                    <p className="text-xs text-muted-foreground">
                      {account.bank_name === "promptpay" ? "พร้อมเพย์" : "เลขบัญชี"}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-medium text-foreground">
                        {account.account_number}
                      </span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(account.account_number)}
                        className="rounded p-1 text-primary hover:bg-primary/10"
                        aria-label="คัดลอกเลขบัญชี"
                      >
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <div className="rounded-lg bg-secondary/40 p-3">
                    <p className="text-xs text-muted-foreground">ชื่อบัญชี</p>
                    <p className="font-medium text-foreground">{account.account_name}</p>
                  </div>
                </div>

                {!account.is_default ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3 gap-1"
                    onClick={() => handleSetDefault(account)}
                    disabled={isSubmitting}
                  >
                    <Star className="h-4 w-4" aria-hidden="true" />
                    ตั้งเป็นบัญชีหลัก
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl bg-secondary/50 p-4 text-center">
            <p className="text-sm text-muted-foreground mb-3">
              ยังไม่มีบัญชีรับเงิน เพิ่มไว้ก่อนสร้างข้อตกลง
            </p>
            <Button type="button" onClick={openCreate} className="gap-1">
              <Plus className="w-4 h-4" aria-hidden="true" />
              เพิ่มบัญชีรับเงิน
            </Button>
          </div>
        )}
      </div>

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetDialog();
        }}
      >
        <DialogContent className="max-w-md mx-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building className="w-5 h-5 text-primary" />
              {editingAccount ? "แก้ไขบัญชีรับเงิน" : "เพิ่มบัญชีรับเงิน"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bankLabel">ชื่อเรียกบัญชี</Label>
              <Input
                id="bankLabel"
                value={formData.label}
                onChange={(event) => setFormData({ ...formData, label: event.target.value })}
                placeholder="เช่น บัญชีหลัก, พร้อมเพย์ส่วนตัว"
              />
            </div>

            <div className="space-y-2">
              <Label>ธนาคารหรือช่องทางรับเงิน</Label>
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
              <Label htmlFor="accountNumber">
                {formData.bankName === "promptpay" ? "หมายเลขพร้อมเพย์" : "เลขบัญชี"}
              </Label>
              <Input
                id="accountNumber"
                value={formData.accountNumber}
                onChange={(event) => {
                  setFormData({ ...formData, accountNumber: event.target.value });
                  setAccountError(null);
                }}
                placeholder={formData.bankName === "promptpay" ? "0812345678" : "123-4-56789-0"}
                inputMode="numeric"
              />
            </div>
            {accountError ? (
              <p className="text-xs text-destructive -mt-2">{accountError}</p>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="accountName">ชื่อบัญชี</Label>
              <Input
                id="accountName"
                value={profileAccountName}
                readOnly
                placeholder="ชื่อจริงจากข้อมูลสมัคร"
              />
              <p className="text-xs text-muted-foreground">
                ดึงจากชื่อจริงและนามสกุลที่บันทึกตอนสมัคร
              </p>
              {!profileAccountName ? (
                <p className="text-xs text-destructive">
                  กรุณากรอกชื่อจริงและนามสกุลในโปรไฟล์ก่อนเพิ่มบัญชีรับเงิน
                </p>
              ) : null}
            </div>

            <label className="flex items-center gap-2 rounded-xl border border-border/80 p-3 text-sm">
              <Checkbox
                checked={formData.isDefault}
                onCheckedChange={(checked) => setFormData({ ...formData, isDefault: checked === true })}
              />
              <span>ตั้งเป็นบัญชีหลัก</span>
            </label>

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setIsDialogOpen(false)}
                disabled={isSubmitting}
              >
                <X className="w-4 h-4 mr-1" />
                ยกเลิก
              </Button>
              <Button
                type="button"
                className="flex-1"
                onClick={handleSave}
                disabled={isSubmitting || !profileAccountName}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    กำลังบันทึก
                  </>
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

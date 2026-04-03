import { useState, useEffect } from "react";
import { Pencil, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getDisplayNameError, getThaiPhoneError, normalizeDigits, normalizeDisplayName } from "@/lib/validation";

interface EditNameDialogProps {
  displayName: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  children?: React.ReactNode;
}

export function EditNameDialog({ 
  displayName, 
  firstName,
  lastName,
  phone,
  children 
}: EditNameDialogProps) {
  const { user, refreshProfile } = useAuth();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState(displayName);
  const [newFirstName, setNewFirstName] = useState(firstName || "");
  const [newLastName, setNewLastName] = useState(lastName || "");
  const [newPhone, setNewPhone] = useState(phone || "");
  const [isSaving, setIsSaving] = useState(false);
  const [displayNameError, setDisplayNameError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = normalizeDigits(e.target.value).slice(0, 10);
    setNewPhone(value);
    setPhoneError(value ? getThaiPhoneError(value) : null);
  };

  // Sync state when props change
  useEffect(() => {
    if (open) {
      setNewName(displayName);
      setNewFirstName(firstName || "");
      setNewLastName(lastName || "");
      setNewPhone(phone || "");
      setDisplayNameError(null);
      setPhoneError(null);
    }
  }, [open, displayName, firstName, lastName, phone]);

  const handleSave = async () => {
    if (!user?.id) return;

    const normalizedDisplayName = normalizeDisplayName(newName);
    const nextDisplayNameError = getDisplayNameError(normalizedDisplayName);
    setDisplayNameError(nextDisplayNameError);
    if (nextDisplayNameError) {
      return;
    }
    
    // Validate phone before saving
    const nextPhoneError = newPhone ? getThaiPhoneError(newPhone) : null;
    setPhoneError(nextPhoneError);
    if (nextPhoneError) {
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ 
          display_name: normalizedDisplayName,
          first_name: newFirstName.trim() || null,
          last_name: newLastName.trim() || null,
          phone: normalizeDigits(newPhone) || null,
        })
        .eq('user_id', user.id);

      if (error) throw error;

      toast.success("บันทึกข้อมูลสำเร็จ");
      
      if (refreshProfile) {
        await refreshProfile();
      }
      
      setOpen(false);
    } catch (error) {
      console.error('Save error:', error);
      toast.error("ไม่สามารถบันทึกได้");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <button className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 transition-colors">
            <Pencil className="w-3 h-3" />
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>แก้ไขข้อมูลส่วนตัว</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Display Name */}
          <div className="space-y-2">
            <Label htmlFor="displayName">ชื่อที่แสดง</Label>
            <Input
              id="displayName"
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                if (displayNameError) setDisplayNameError(null);
              }}
              placeholder="ใส่ชื่อของคุณ"
              maxLength={50}
              autoComplete="nickname"
              aria-invalid={Boolean(displayNameError)}
            />
            {displayNameError ? (
              <p className="text-xs text-destructive">{displayNameError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                ใช้ได้เฉพาะตัวอักษร ตัวเลข ช่องว่าง และ . _ -
              </p>
            )}
          </div>

          {/* First Name */}
          <div className="space-y-2">
            <Label htmlFor="firstName">ชื่อจริง</Label>
            <Input
              id="firstName"
              value={newFirstName}
              onChange={(e) => setNewFirstName(e.target.value)}
              placeholder="ใส่ชื่อจริง"
              maxLength={50}
              autoComplete="given-name"
            />
          </div>

          {/* Last Name */}
          <div className="space-y-2">
            <Label htmlFor="lastName">นามสกุล</Label>
            <Input
              id="lastName"
              value={newLastName}
              onChange={(e) => setNewLastName(e.target.value)}
              placeholder="ใส่นามสกุล"
              maxLength={50}
              autoComplete="family-name"
            />
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <Label htmlFor="phone">เบอร์โทรศัพท์</Label>
            <Input
              id="phone"
              type="tel"
              inputMode="numeric"
              value={newPhone}
              onChange={handlePhoneChange}
              placeholder="0812345678"
              maxLength={10}
              autoComplete="tel"
              aria-invalid={Boolean(phoneError)}
              className={phoneError ? "border-destructive" : ""}
            />
            {phoneError ? (
              <p className="text-xs text-destructive">{phoneError}</p>
            ) : null}
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setOpen(false)}
          >
            ยกเลิก
          </Button>
          <Button
            className="flex-1"
            onClick={handleSave}
            disabled={isSaving || !normalizeDisplayName(newName) || Boolean(displayNameError) || Boolean(phoneError)}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                กำลังบันทึก...
              </>
            ) : (
              "บันทึก"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

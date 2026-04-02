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
  const [phoneError, setPhoneError] = useState<string | null>(null);

  // Validate phone number (10 digits only)
  const validatePhone = (value: string): boolean => {
    if (!value) return true; // Empty is allowed
    const digitsOnly = value.replace(/\D/g, '');
    if (digitsOnly.length !== 10) {
      setPhoneError("เบอร์โทรศัพท์ต้องมี 10 หลัก");
      return false;
    }
    setPhoneError(null);
    return true;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, ''); // Keep only digits
    setNewPhone(value);
    if (value) validatePhone(value);
    else setPhoneError(null);
  };

  // Sync state when props change
  useEffect(() => {
    if (open) {
      setNewName(displayName);
      setNewFirstName(firstName || "");
      setNewLastName(lastName || "");
      setNewPhone(phone || "");
    }
  }, [open, displayName, firstName, lastName, phone]);

  const handleSave = async () => {
    if (!user?.id || !newName.trim()) return;
    
    // Validate phone before saving
    if (newPhone && !validatePhone(newPhone)) {
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ 
          display_name: newName.trim(),
          first_name: newFirstName.trim() || null,
          last_name: newLastName.trim() || null,
          phone: newPhone.trim() || null,
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
              onChange={(e) => setNewName(e.target.value)}
              placeholder="ใส่ชื่อของคุณ"
              maxLength={50}
            />
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
              className={phoneError ? "border-destructive" : ""}
            />
            {phoneError && (
              <p className="text-xs text-destructive">{phoneError}</p>
            )}
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
            disabled={isSaving || !newName.trim() || !!phoneError}
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

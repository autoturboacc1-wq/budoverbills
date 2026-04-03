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
import { AvatarUpload } from "@/components/AvatarUpload";
import { getThaiPhoneError, normalizeDigits } from "@/lib/validation";

interface EditProfileDialogProps {
  currentAvatarUrl?: string | null;
  displayName: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  children?: React.ReactNode;
}

export function EditProfileDialog({ 
  currentAvatarUrl, 
  displayName, 
  firstName,
  lastName,
  phone,
  children 
}: EditProfileDialogProps) {
  const { user, refreshProfile } = useAuth();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState(displayName);
  const [newFirstName, setNewFirstName] = useState(firstName || "");
  const [newLastName, setNewLastName] = useState(lastName || "");
  const [newPhone, setNewPhone] = useState(phone || "");
  const [isSaving, setIsSaving] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  // Sync state when props change
  useEffect(() => {
    if (open) {
      setNewName(displayName);
      setNewFirstName(firstName || "");
      setNewLastName(lastName || "");
      setNewPhone(phone || "");
      setPhoneError(null);
    }
  }, [open, displayName, firstName, lastName, phone]);

  const handleSave = async () => {
    if (!user?.id || !newName.trim()) return;

    const phoneValidationError = getThaiPhoneError(newPhone);
    if (phoneValidationError) {
      setPhoneError(phoneValidationError);
      toast.error(phoneValidationError);
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
          <button className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:bg-primary/90 transition-colors">
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>แก้ไขโปรไฟล์</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Avatar Upload */}
          <div className="flex justify-center">
            <AvatarUpload 
              currentAvatarUrl={currentAvatarUrl}
              displayName={displayName}
            />
          </div>
          
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
              value={newPhone}
              onChange={(e) => {
                setNewPhone(e.target.value);
                setPhoneError(null);
              }}
              placeholder="0812345678"
              maxLength={15}
              inputMode="numeric"
              autoComplete="tel"
              aria-invalid={Boolean(phoneError)}
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
            disabled={isSaving || !newName.trim()}
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

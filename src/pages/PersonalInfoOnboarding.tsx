import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { User, Phone, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
import { BobLogo } from "@/components/BobLogo";

const personalInfoSchema = z.object({
  firstName: z.string().min(1, "กรุณากรอกชื่อ").max(100),
  lastName: z.string().min(1, "กรุณากรอกนามสกุล").max(100),
  phone: z.string().regex(/^0[0-9]{8,9}$/, "เบอร์โทรไม่ถูกต้อง (เช่น 0812345678)"),
});

export default function PersonalInfoOnboarding() {
  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ firstName?: string; lastName?: string; phone?: string }>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate
    const result = personalInfoSchema.safeParse({ firstName, lastName, phone });
    if (!result.success) {
      const fieldErrors: { firstName?: string; lastName?: string; phone?: string } = {};
      result.error.errors.forEach((err) => {
        const field = err.path[0] as string;
        fieldErrors[field as keyof typeof fieldErrors] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    if (!user) {
      toast.error("กรุณาเข้าสู่ระบบก่อน");
      navigate("/auth");
      return;
    }

    setIsLoading(true);
    setErrors({});

    try {
      // Update profile with personal info
      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.trim(),
          display_name: `${firstName.trim()} ${lastName.trim()}`,
        })
        .eq("user_id", user.id);

      if (error) throw error;

      await refreshProfile();
      
      toast.success("บันทึกข้อมูลสำเร็จ!");
      
      // Continue to PDPA consent or home
      navigate("/pdpa-consent", { replace: true });
    } catch (error: any) {
      console.error("Error saving personal info:", error);
      toast.error("เกิดข้อผิดพลาดในการบันทึกข้อมูล");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-hero flex flex-col">
      <div className="flex-1 flex flex-col justify-center px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-sm mx-auto w-full"
        >
          {/* Logo & Title */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <BobLogo size="lg" />
            </div>
            <h1 className="text-2xl font-heading font-semibold text-foreground mb-2">
              เกือบเสร็จแล้ว! 🎉
            </h1>
            <p className="text-muted-foreground">
              กรอกข้อมูลเพื่อใช้ในเอกสารข้อตกลง
            </p>
          </div>

          {/* Info Box */}
          <div className="bg-primary/10 rounded-xl p-4 mb-6">
            <p className="text-sm text-foreground">
              📝 ข้อมูลนี้จะแสดงในบันทึกข้อตกลงการยืมเงิน เพื่อให้สามารถใช้เป็นหลักฐานทางกฎหมายได้
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* First Name */}
            <div>
              <Label htmlFor="firstName" className="text-foreground">
                ชื่อจริง <span className="text-destructive">*</span>
              </Label>
              <div className="relative mt-1">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="firstName"
                  type="text"
                  value={firstName}
                  onChange={(e) => {
                    setFirstName(e.target.value);
                    if (errors.firstName) setErrors({ ...errors, firstName: undefined });
                  }}
                  placeholder="ชื่อจริง"
                  className={`pl-10 h-12 ${errors.firstName ? "border-destructive" : ""}`}
                />
              </div>
              {errors.firstName && (
                <p className="text-destructive text-sm mt-1">{errors.firstName}</p>
              )}
            </div>

            {/* Last Name */}
            <div>
              <Label htmlFor="lastName" className="text-foreground">
                นามสกุล <span className="text-destructive">*</span>
              </Label>
              <div className="relative mt-1">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="lastName"
                  type="text"
                  value={lastName}
                  onChange={(e) => {
                    setLastName(e.target.value);
                    if (errors.lastName) setErrors({ ...errors, lastName: undefined });
                  }}
                  placeholder="นามสกุล"
                  className={`pl-10 h-12 ${errors.lastName ? "border-destructive" : ""}`}
                />
              </div>
              {errors.lastName && (
                <p className="text-destructive text-sm mt-1">{errors.lastName}</p>
              )}
            </div>

            {/* Phone */}
            <div>
              <Label htmlFor="phone" className="text-foreground">
                เบอร์โทรศัพท์ <span className="text-destructive">*</span>
              </Label>
              <div className="relative mt-1">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => {
                    // Only allow numbers
                    const value = e.target.value.replace(/\D/g, "").slice(0, 10);
                    setPhone(value);
                    if (errors.phone) setErrors({ ...errors, phone: undefined });
                  }}
                  placeholder="0812345678"
                  className={`pl-10 h-12 ${errors.phone ? "border-destructive" : ""}`}
                  inputMode="numeric"
                />
              </div>
              {errors.phone && (
                <p className="text-destructive text-sm mt-1">{errors.phone}</p>
              )}
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full h-12 text-base mt-6"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  กำลังบันทึก...
                </>
              ) : (
                <>
                  ดำเนินการต่อ
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </form>

          {/* Privacy Note */}
          <p className="text-center text-xs text-muted-foreground mt-6">
            ข้อมูลของคุณจะถูกเก็บรักษาอย่างปลอดภัย ตาม
            <br />
            นโยบายความเป็นส่วนตัว และ พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล
          </p>
        </motion.div>
      </div>
    </div>
  );
}

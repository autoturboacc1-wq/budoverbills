import { useState } from "react";
import { motion } from "framer-motion";
import { PageTransition } from "@/components/ux/PageTransition";
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
import { InlineValidationMessage, PageHeader, PageSection } from "@/components/ux";

const personalInfoSchema = z.object({
  firstName: z.string().trim().min(1, "กรุณากรอกชื่อ").max(100),
  lastName: z.string().trim().min(1, "กรุณากรอกนามสกุล").max(100),
  phone: z.string().trim().regex(/^0[0-9]{8,9}$/, "เบอร์โทรไม่ถูกต้อง (เช่น 0812345678)"),
});

async function savePersonalInfo(userId: string, values: z.infer<typeof personalInfoSchema>) {
  const payload = {
    first_name: values.firstName,
    last_name: values.lastName,
    phone: values.phone,
    display_name: `${values.firstName} ${values.lastName}`,
  };

  const { data: updatedProfile, error: updateError } = await supabase
    .from("profiles")
    .update(payload)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();

  if (updateError) {
    throw updateError;
  }

  if (updatedProfile) {
    return;
  }

  const { data: generatedUserCode, error: userCodeError } = await supabase.rpc("generate_user_code");

  if (userCodeError) {
    throw userCodeError;
  }

  const { error: insertError } = await supabase
    .from("profiles")
    .insert({
      user_id: userId,
      user_code: generatedUserCode,
      ...payload,
    });

  if (insertError) {
    throw insertError;
  }
}

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
      await savePersonalInfo(user.id, result.data);

      await refreshProfile();
      
      toast.success("บันทึกข้อมูลสำเร็จ!");
      
      // Continue to PDPA consent or home
      navigate("/pdpa-consent", { replace: true });
    } catch (error) {
      console.error("Error saving personal info:", error);
      toast.error("เกิดข้อผิดพลาดในการบันทึกข้อมูล");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <PageTransition>
    <div className="min-h-screen">
      <div className="page-shell">
        <PageHeader
          eyebrow="Onboarding"
          title="กรอกข้อมูลสำหรับเอกสารข้อตกลง"
          description="ข้อมูลนี้จะใช้ในเอกสารและหลักฐานการยืนยันตัวตนภายในระบบ"
        />

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
          <div className="surface-panel text-center">
            <div className="mb-4 flex justify-center">
              <BobLogo size="lg" />
            </div>
            <p className="text-sm text-muted-foreground">
              ขั้นตอนนี้ใช้เวลาไม่นาน แต่สำคัญต่อความถูกต้องของข้อมูลในเอกสารข้อตกลง
            </p>
          </div>

          <PageSection>
            <InlineValidationMessage
              tone="info"
              message="ชื่อ นามสกุล และเบอร์โทรจะถูกใช้ในเอกสารข้อตกลงเพื่อให้ข้อมูลคู่สัญญาตรงกัน"
            />

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
          </PageSection>

          <div className="surface-panel">
            <p className="text-center text-xs text-muted-foreground">
              ข้อมูลของคุณจะถูกเก็บรักษาอย่างปลอดภัยตามนโยบายความเป็นส่วนตัวและ พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล
            </p>
          </div>
        </motion.div>
      </div>
    </div>
    </PageTransition>
  );
}

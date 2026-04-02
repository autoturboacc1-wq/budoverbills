import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Heart, 
  Users, 
  FileText, 
  Bell, 
  ChevronRight,
  Sparkles,
  HandHeart
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BobLogo } from "@/components/BobLogo";

interface WelcomeOnboardingProps {
  userName?: string;
  onComplete: () => void;
}

const onboardingSteps = [
  {
    icon: Heart,
    title: "ยินดีต้อนรับสู่ Bud Over Bills",
    subtitle: "มิตรภาพมาก่อนเสมอ",
    description: "เราเชื่อว่าเรื่องเงินไม่ควรทำลายมิตรภาพ BOB ช่วยให้คุณจัดการข้อตกลงทางการเงินกับเพื่อนอย่างโปร่งใสและอบอุ่น",
    color: "text-primary",
    bgColor: "bg-primary/10",
  },
  {
    icon: FileText,
    title: "สร้างสัญญาที่ชัดเจน",
    subtitle: "โปร่งใส ไม่เข้าใจผิด",
    description: "บันทึกข้อตกลงการยืม-ให้ยืมเงินอย่างเป็นระบบ ทั้งสองฝ่ายเห็นข้อมูลเดียวกัน ไม่ต้องจำ ไม่ต้องเถียงกัน",
    color: "text-status-paid",
    bgColor: "bg-status-paid/10",
  },
  {
    icon: Users,
    title: "แชร์บิลกับกลุ่มเพื่อน",
    subtitle: "หารเท่าๆ กัน ง่ายๆ",
    description: "จัดการค่าใช้จ่ายกลุ่มได้สะดวก ไม่ว่าจะทริปเที่ยว งานเลี้ยง หรือค่าอาหาร ทุกคนเห็นตรงกัน",
    color: "text-status-negotiating",
    bgColor: "bg-status-negotiating/10",
  },
  {
    icon: Bell,
    title: "แจ้งเตือนอ่อนโยน",
    subtitle: "ไม่กดดัน ไม่น่าอาย",
    description: "ระบบจะแจ้งเตือนอย่างสุภาพ เพราะเราเข้าใจว่าทุกคนมีช่วงเวลาที่ยากลำบาก เราอยู่ข้างคุณเสมอ",
    color: "text-status-pending",
    bgColor: "bg-status-pending/10",
  },
  {
    icon: HandHeart,
    title: "เราอยู่ข้างคุณ",
    subtitle: "พร้อมช่วยเหลือทุกสถานการณ์",
    description: "ไม่ว่าคุณจะเป็นผู้ให้ยืมหรือผู้ยืม BOB ดูแลทั้งสองฝ่ายอย่างเท่าเทียม เพราะมิตรภาพสำคัญกว่าเงิน",
    color: "text-primary",
    bgColor: "bg-primary/10",
  },
];

export function WelcomeOnboarding({ userName, onComplete }: WelcomeOnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    if (currentStep < onboardingSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  const step = onboardingSteps[currentStep];
  const Icon = step.icon;
  const isLastStep = currentStep === onboardingSteps.length - 1;

  return (
    <div className="min-h-screen bg-gradient-hero flex flex-col">
      {/* Skip Button */}
      <div className="flex justify-end p-4">
        <button
          onClick={handleSkip}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ข้าม
        </button>
      </div>

      <div className="flex-1 flex flex-col justify-center px-6 pb-12">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.3 }}
            className="max-w-sm mx-auto w-full text-center"
          >
            {/* Logo on first step */}
            {currentStep === 0 && (
              <motion.div 
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex justify-center mb-6"
              >
                <BobLogo size="lg" />
              </motion.div>
            )}

            {/* Icon */}
            {currentStep > 0 && (
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 200, damping: 15 }}
                className={`w-20 h-20 mx-auto rounded-full ${step.bgColor} flex items-center justify-center mb-6`}
              >
                <Icon className={`w-10 h-10 ${step.color}`} />
              </motion.div>
            )}

            {/* Welcome with name */}
            {currentStep === 0 && userName && (
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-lg text-primary font-medium mb-2"
              >
                สวัสดีคุณ {userName} 👋
              </motion.p>
            )}

            {/* Title */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-2xl font-heading font-semibold text-foreground mb-2"
            >
              {step.title}
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className={`text-sm font-medium ${step.color} mb-4`}
            >
              {step.subtitle}
            </motion.p>

            {/* Description */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-muted-foreground leading-relaxed"
            >
              {step.description}
            </motion.p>

            {/* Sparkles decoration on last step */}
            {isLastStep && (
              <motion.div
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4, type: "spring" }}
                className="flex justify-center gap-2 mt-4"
              >
                <Sparkles className="w-5 h-5 text-yellow-500" />
                <Sparkles className="w-4 h-4 text-primary" />
                <Sparkles className="w-5 h-5 text-yellow-500" />
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Progress Dots & Button */}
        <div className="max-w-sm mx-auto w-full mt-12">
          {/* Progress Dots */}
          <div className="flex justify-center gap-2 mb-8">
            {onboardingSteps.map((_, index) => (
              <motion.div
                key={index}
                initial={false}
                animate={{
                  width: index === currentStep ? 24 : 8,
                  backgroundColor: index === currentStep 
                    ? "hsl(var(--primary))" 
                    : index < currentStep 
                      ? "hsl(var(--primary) / 0.5)"
                      : "hsl(var(--muted))",
                }}
                transition={{ duration: 0.3 }}
                className="h-2 rounded-full"
              />
            ))}
          </div>

          {/* Action Button */}
          <Button
            onClick={handleNext}
            className="w-full h-12 text-base group"
          >
            {isLastStep ? (
              <>
                เริ่มต้นใช้งาน
                <Sparkles className="w-4 h-4 ml-2 group-hover:animate-pulse" />
              </>
            ) : (
              <>
                ถัดไป
                <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

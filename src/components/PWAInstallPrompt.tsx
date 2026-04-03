import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, X, Share, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const DISMISS_STORAGE_KEY = "pwa-install-dismissed-at";

function isWithinCooldown(): boolean {
  const storedValue = localStorage.getItem(DISMISS_STORAGE_KEY);
  if (!storedValue) {
    return false;
  }

  const dismissedAt = Number(storedValue);
  if (Number.isNaN(dismissedAt)) {
    localStorage.removeItem(DISMISS_STORAGE_KEY);
    return false;
  }

  return Date.now() - dismissedAt < DISMISS_COOLDOWN_MS;
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const standaloneMediaQuery = window.matchMedia("(display-mode: standalone)");
    const getStandaloneStatus = () =>
      standaloneMediaQuery.matches ||
      ((navigator as Navigator & { standalone?: boolean }).standalone === true);
    const ios =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    setIsStandalone(getStandaloneStatus());
    setIsIOS(ios);

    const timers: number[] = [];
    const canShowPrompt = () => !getStandaloneStatus() && !isWithinCooldown();

    const showPromptWithDelay = (delay: number) => {
      const timer = window.setTimeout(() => {
        if (canShowPrompt()) {
          setShowPrompt(true);
        }
      }, delay);

      timers.push(timer);
    };

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);

      showPromptWithDelay(3000);
    };

    const handleAppInstalled = () => {
      setShowPrompt(false);
      setDeferredPrompt(null);
      setIsStandalone(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    if (ios && !getStandaloneStatus()) {
      showPromptWithDelay(5000);
    }

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      setShowPrompt(false);
    }

    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem(DISMISS_STORAGE_KEY, Date.now().toString());
  };

  // Don't show if already installed
  if (isStandalone) return null;

  return (
    <AnimatePresence>
      {showPrompt && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", damping: 25 }}
          className="fixed bottom-20 left-4 right-4 z-50 md:left-auto md:right-4 md:w-96"
        >
          <div className="bg-card border border-border rounded-2xl shadow-elevated p-4">
            <button
              onClick={handleDismiss}
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-xl bg-primary flex items-center justify-center shrink-0">
                <span className="font-cherry text-white text-xl">BOB</span>
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-foreground">ติดตั้งแอป BOB</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  เข้าถึงได้เร็วขึ้นจากหน้าจอหลัก และบางหน้าสามารถเปิดจากแคชได้หลังเคยใช้งาน
                </p>
                <p className="mt-1 text-xs text-muted-foreground/80">
                  ข้อมูลสดและการทำรายการส่วนใหญ่ยังต้องต่อเน็ต
                </p>

                {isIOS ? (
                  <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground flex items-center gap-2">
                      <Share className="w-4 h-4" />
                      กด <strong>Share</strong> แล้วเลือก
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                      <Plus className="w-4 h-4" />
                      <strong>"Add to Home Screen"</strong>
                    </p>
                  </div>
                ) : (
                  <Button
                    onClick={handleInstall}
                    className="mt-3 w-full"
                    size="sm"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    ติดตั้งเลย
                  </Button>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

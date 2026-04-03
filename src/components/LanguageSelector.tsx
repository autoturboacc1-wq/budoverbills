import { Globe } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useLanguage, languages, Language } from "@/contexts/LanguageContext";

export function LanguageSelector() {
  const { language, setLanguage, t, currentLanguage } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = "language-selector-options";

  const handleSelect = (code: Language) => {
    setLanguage(code);
    setIsOpen(false);
  };

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-label={`${t("profile.language")}: ${currentLanguage.nativeName}`}
        className="w-full flex items-center justify-between p-4 hover:bg-secondary/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Globe className="w-5 h-5 text-muted-foreground" />
          <span className="text-foreground">{t('profile.language')}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-lg">{currentLanguage.flag}</span>
          <span className="text-sm text-muted-foreground">{currentLanguage.nativeName}</span>
        </div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute left-0 right-0 top-full z-50 bg-card border border-border rounded-xl shadow-lg overflow-hidden"
          >
            <p className="px-3 py-2 text-xs font-medium text-muted-foreground border-b border-border">
              {t('profile.selectLanguage')}
            </p>
            <div id={listboxId} role="listbox" aria-label={t("profile.selectLanguage")} className="p-2 max-h-[300px] overflow-y-auto">
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => handleSelect(lang.code)}
                  role="option"
                  aria-selected={language === lang.code}
                  aria-label={`${lang.nativeName} ${lang.name}`}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                    language === lang.code
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-secondary/50 text-foreground'
                  }`}
                >
                  <span className="text-xl">{lang.flag}</span>
                  <div className="flex-1 text-left">
                    <p className="font-medium">{lang.nativeName}</p>
                    <p className="text-xs text-muted-foreground">{lang.name}</p>
                  </div>
                  {language === lang.code && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-2 h-2 rounded-full bg-primary"
                    />
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

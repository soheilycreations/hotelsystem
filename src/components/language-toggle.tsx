"use client";

import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/i18n/language-context";

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle language"
      title={language === "en" ? "සිංහලට මාරු කරන්න" : "Switch to English"}
      onClick={() => setLanguage(language === "en" ? "si" : "en")}
    >
      <span className="text-xs font-bold">{language === "en" ? "EN" : "සිං"}</span>
    </Button>
  );
}

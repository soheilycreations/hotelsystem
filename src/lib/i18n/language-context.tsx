"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { SI_DICT } from "./translations";

export type Language = "en" | "si";

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (text: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = "hotel-language";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");

  // Read the saved preference after mount only — reading localStorage during
  // the initial render would produce a different result on the server than
  // the client and trigger a hydration mismatch.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "si" || saved === "en") setLanguageState(saved);
    } catch {
      // Private browsing / storage blocked — just stay on the default.
    }
  }, []);

  function setLanguage(next: Language) {
    setLanguageState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore — the toggle still works for this page load.
    }
  }

  function t(text: string): string {
    if (language !== "si") return text;
    return SI_DICT[text] ?? text;
  }

  return <LanguageContext.Provider value={{ language, setLanguage, t }}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within a LanguageProvider");
  return ctx;
}

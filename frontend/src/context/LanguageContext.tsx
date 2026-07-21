import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { TRANSLATIONS, type Language } from '../i18n/translations';

export type { Language };

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

function resolve(dict: unknown, key: string): string | undefined {
  let current: unknown = dict;
  for (const part of key.split('.')) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : undefined;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    const stored = localStorage.getItem('tdss_language');
    return stored === 'en' ? 'en' : 'th';
  });

  useEffect(() => {
    localStorage.setItem('tdss_language', language);
  }, [language]);

  const t = useMemo(() => {
    return (key: string): string => resolve(TRANSLATIONS[language], key) ?? resolve(TRANSLATIONS.th, key) ?? key;
  }, [language]);

  return <LanguageContext.Provider value={{ language, setLanguage, t }}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}

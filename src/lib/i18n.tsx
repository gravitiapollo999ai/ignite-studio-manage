import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "en" | "es";
const KEY = "lang";

export function detectLang(stored: string | null, browser: string | undefined): Lang {
  if (stored === "en" || stored === "es") return stored;
  return browser?.toLowerCase().startsWith("es") ? "es" : "en";
}

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (en: string, es: string) => string };
const I18nCtx = createContext<Ctx>({ lang: "en", setLang: () => {}, t: (en) => en });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  useEffect(() => {
    setLangState(detectLang(localStorage.getItem(KEY), navigator.language));
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const setLang = useCallback((l: Lang) => {
    localStorage.setItem(KEY, l);
    setLangState(l);
  }, []);
  const t = useCallback((en: string, es: string) => (lang === "es" ? es : en), [lang]);
  return <I18nCtx.Provider value={{ lang, setLang, t }}>{children}</I18nCtx.Provider>;
}

/** Usage: const { t } = useI18n(); t("English text", "Texto en español") */
export function useI18n() {
  return useContext(I18nCtx);
}

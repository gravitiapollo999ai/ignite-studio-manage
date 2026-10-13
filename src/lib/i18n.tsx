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

/** Spanish display text for the stock package names/descriptions stored in the database. Unknown text (admin-edited) is shown as stored. */
const PKG_ES: Record<string, string> = {
  "Starter – 10 videos": "Inicial – 10 videos",
  "Growth – 25 videos": "Crecimiento – 25 videos",
  "Scale – 50 videos": "Escala – 50 videos",
  "Test the format with your business.": "Prueba el formato con tu negocio.",
  "A steady flow of fresh content every month.": "Un flujo constante de contenido nuevo cada mes.",
  "High-volume content for brands that post daily.": "Contenido en volumen para marcas que publican a diario.",
};

export function pkgText(text: string | null | undefined, lang: Lang): string {
  if (!text) return text ?? "";
  return lang === "es" ? (PKG_ES[text.trim()] ?? text) : text;
}

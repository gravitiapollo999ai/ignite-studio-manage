import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}if(t==='dark')document.documentElement.classList.add('dark')}catch(e){}})();`;

export function ThemeToggle() {
  const { t } = useI18n();
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
    setDark(next);
  }
  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label={dark ? t("Switch to light mode", "Cambiar a modo claro") : t("Switch to dark mode", "Cambiar a modo oscuro")}>
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

export function LangToggle() {
  const { lang, setLang } = useI18n();
  return (
    <div className="flex items-center rounded-md border border-border p-0.5 text-xs font-medium" role="group" aria-label="Language / Idioma">
      {(["en", "es"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={cn("rounded px-2 py-1 uppercase", lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export function HeaderControls({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <LangToggle />
      <ThemeToggle />
    </div>
  );
}

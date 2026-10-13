import { format } from "date-fns";
import { Check } from "lucide-react";
import { JOB_STEPS, STATUS_LABELS, STATUS_LABELS_ES } from "@/lib/pricing";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Ev = { id: string; status: string; message: string | null; created_at: string };

export function JobTimeline({ status, tryNumber, maxTries, events }: { status: string; tryNumber: number; maxTries: number; events: Ev[] }) {
  const { t, lang } = useI18n();
  const labels = lang === "es" ? STATUS_LABELS_ES : STATUS_LABELS;
  // Events after the latest revision define the current try.
  const lastRev = [...events].reverse().findIndex((e) => e.status === "revision");
  const current = lastRev === -1 ? events : events.slice(events.length - lastRev);
  const reached = (st: string) => current.find((e) => e.status === st) ?? (st === "submitted" && lastRev === -1 ? events[0] : undefined);
  const idx = JOB_STEPS.indexOf(status as (typeof JOB_STEPS)[number]);
  return (
    <div className="space-y-6">
      {tryNumber > 1 && (
        <p className="inline-flex rounded-full bg-warning/20 px-3 py-1 text-sm font-medium">{t(`Revision (try ${tryNumber} of ${maxTries})`, `Revisión (intento ${tryNumber} de ${maxTries})`)}</p>
      )}
      <ol className="relative space-y-4 border-l border-border pl-6 md:flex md:space-y-0 md:border-l-0 md:pl-0">
        {JOB_STEPS.map((st, i) => {
          const ev = reached(st);
          const done = status === "revision" ? st === "submitted" : idx >= i;
          return (
            <li key={st} className="relative md:flex-1">
              <span className={cn("absolute -left-[33px] grid h-5 w-5 place-items-center rounded-full border-2 bg-background md:static md:mb-2", done ? "border-primary bg-primary text-primary-foreground" : "border-border")}>{done && <Check className="h-3 w-3" />}</span>
              <p className={cn("text-sm font-medium", !done && "text-muted-foreground")}>{labels[st]}</p>
              {ev && done && <p className="text-xs text-muted-foreground">{format(new Date(ev.created_at), "MMM d, HH:mm")}</p>}
            </li>
          );
        })}
      </ol>
      {events.some((e) => e.message) && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("Updates", "Actualizaciones")}</p>
          {[...events].reverse().filter((e) => e.message).map((e) => (
            <div key={e.id} className="rounded-lg bg-secondary p-3 text-sm">
              <p className="text-xs text-muted-foreground">{labels[e.status as keyof typeof STATUS_LABELS] ?? e.status} · {format(new Date(e.created_at), "MMM d, HH:mm")}</p>
              <p>{e.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

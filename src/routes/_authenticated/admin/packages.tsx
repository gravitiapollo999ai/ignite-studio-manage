import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { brandTitle, type Pkg , errMsg } from "@/lib/data";
import { useI18n, pkgText } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/admin/packages")({
  head: ({ matches }) => ({ meta: [{ title: brandTitle(matches, "Admin · Packages") }] }),
  component: Packages,
});

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  videos: z.coerce.number().int().positive(),
  credits: z.coerce.number().int().positive(),
  price_label: z.string().trim().min(1).max(40),
  description: z.string().trim().max(500),
  sort_order: z.coerce.number().int(),
});

function Packages() {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const pkgs = useQuery({ queryKey: ["admin-packages"], queryFn: async () => (await supabase.from("packages").select("*").order("sort_order")).data ?? [] });
  const [edit, setEdit] = useState<Partial<Pkg> | null>(null);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["admin-packages"] }); qc.invalidateQueries({ queryKey: ["packages"] }); };

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const p = schema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!p.success) return toast.error(`${p.error.issues[0].path[0]}: ${p.error.issues[0].message}`);
    const { error } = edit?.id ? await supabase.from("packages").update(p.data).eq("id", edit.id) : await supabase.from("packages").insert(p.data);
    if (error) return toast.error(errMsg(error));
    toast.success(t("Package saved", "Paquete guardado")); setEdit(null); refresh();
  }
  async function toggle(p: Pkg) {
    const { error } = await supabase.from("packages").update({ active: !p.active }).eq("id", p.id);
    if (error) return toast.error(errMsg(error));
    refresh();
  }
  async function del(p: Pkg) {
    if (!confirm(t(`Delete ${p.name}?`, `¿Eliminar ${p.name}?`))) return;
    const { error } = await supabase.from("packages").delete().eq("id", p.id);
    if (error) return toast.error(errMsg(error));
    toast.success(t("Deleted", "Eliminado")); refresh();
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">{t("Packages", "Paquetes")}</h1><Button onClick={() => setEdit({})}>{t("New package", "Nuevo paquete")}</Button></div>
      {pkgs.isLoading ? <Skeleton className="h-40" /> : (
        <div className="divide-y divide-border rounded-xl border border-border bg-card">{pkgs.data!.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div><p className="font-medium">{pkgText(p.name, lang)}</p><p className="text-sm text-muted-foreground">{p.videos} {t("videos", "videos")} · {p.credits} {t("credits", "créditos")} · {p.price_label}</p></div>
            <div className="flex items-center gap-2"><Switch checked={p.active} onCheckedChange={() => toggle(p)} aria-label={t("Active", "Activo")} /><Button size="sm" variant="outline" onClick={() => setEdit(p)}>{t("Edit", "Editar")}</Button><Button size="sm" variant="ghost" onClick={() => del(p)}>{t("Delete", "Eliminar")}</Button></div>
          </div>
        ))}</div>
      )}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent><DialogHeader><DialogTitle>{edit?.id ? t("Edit package", "Editar paquete") : t("New package", "Nuevo paquete")}</DialogTitle></DialogHeader>
          <form onSubmit={save} className="space-y-3" key={edit?.id ?? "new"}>
            <div className="space-y-1"><Label>{t("Name", "Nombre")}</Label><Input name="name" defaultValue={edit?.name ?? ""} /></div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1"><Label>{t("Videos", "Videos")}</Label><Input name="videos" type="number" defaultValue={edit?.videos ?? 10} /></div>
              <div className="space-y-1"><Label>{t("Credits", "Créditos")}</Label><Input name="credits" type="number" defaultValue={edit?.credits ?? 10} /></div>
              <div className="space-y-1"><Label>{t("Order", "Orden")}</Label><Input name="sort_order" type="number" defaultValue={edit?.sort_order ?? 0} /></div>
            </div>
            <div className="space-y-1"><Label>{t("Price label", "Etiqueta de precio")}</Label><Input name="price_label" defaultValue={edit?.price_label ?? "USD "} /></div>
            <div className="space-y-1"><Label>{t("Description", "Descripción")}</Label><Textarea name="description" defaultValue={edit?.description ?? ""} /></div>
            <DialogFooter><Button>{t("Save", "Guardar")}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

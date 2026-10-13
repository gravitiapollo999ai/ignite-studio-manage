import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Check, ImagePlus, Link2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { useSettings } from "@/components/site";
import { balanceQuery, brandTitle, errMsg } from "@/lib/data";
import { BUSINESS_TYPES, SOURCE_LABELS, defaultDuration, detectPlatform, formatMmSs, jobCost, parseMmSs, type SourceType } from "@/lib/pricing";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/jobs/new")({
  head: ({ matches }) => ({ meta: [{ title: brandTitle(matches, "New video") }] }),
  component: NewJob,
});

const STEPS = ["Source", "Subject", "Review"];

function NewJob() {
  const { user } = Route.useRouteContext();
  const s = useSettings();
  const nav = useNavigate();
  const qc = useQueryClient();
  const bal = useQuery(balanceQuery(user.id));
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  // source
  const [mode, setMode] = useState<"link" | "upload">("link");
  const [url, setUrl] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileDur, setFileDur] = useState<number | null>(null);
  const platform = mode === "link" ? detectPlatform(url) : null;

  // subject
  const [subjectType, setSubjectType] = useState<"person" | "product" | "business">("person");
  const [subjectName, setSubjectName] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [bizType, setBizType] = useState("");
  const [bizOther, setBizOther] = useState("");
  const [notes, setNotes] = useState("");

  // review
  const clipLen = mode === "upload" ? fileDur : platform === "youtube" ? (() => { const a = parseMmSs(start), b = parseMmSs(end); return a != null && b != null && b > a ? b - a : null; })() : null;
  const [duration, setDuration] = useState<number>(15);
  useEffect(() => { setDuration(defaultDuration(clipLen, s.max_video_seconds)); }, [clipLen, s.max_video_seconds]);

  useEffect(() => { if (!image) return setPreview(null); const u = URL.createObjectURL(image); setPreview(u); return () => URL.revokeObjectURL(u); }, [image]);

  function onVideo(f: File | null) {
    setFileDur(null);
    if (!f) return setFile(null);
    if (f.type !== "video/mp4") return toast.error("Please upload an MP4 file");
    if (f.size > 500 * 1024 * 1024) return toast.error("Max file size is 500 MB");
    setFile(f);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => { setFileDur(Math.round(v.duration)); URL.revokeObjectURL(v.src); };
    v.src = URL.createObjectURL(f);
  }
  function onImage(f: File | null) {
    if (!f) return setImage(null);
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) return toast.error("Use JPG, PNG or WebP");
    if (f.size > 20 * 1024 * 1024) return toast.error("Max image size is 20 MB");
    setImage(f);
  }

  function validateSource() {
    if (mode === "link") {
      if (!platform) { toast.error("Paste a TikTok, YouTube Shorts, YouTube or Instagram Reel link"); return false; }
      if (platform === "youtube") {
        if ((start && parseMmSs(start) == null) || (end && parseMmSs(end) == null)) { toast.error("Use mm:ss for start and end"); return false; }
        const a = parseMmSs(start), b = parseMmSs(end);
        if (a != null && b != null && b <= a) { toast.error("End must be after start"); return false; }
      }
    } else if (!file) { toast.error("Upload an MP4 video"); return false; }
    return true;
  }
  function validateSubject() {
    const r = z.object({ name: z.string().trim().min(1, "Enter the subject name").max(120) }).safeParse({ name: subjectName });
    if (!r.success) { toast.error(r.error.issues[0].message); return false; }
    if (!image) { toast.error("Upload a reference image of the subject"); return false; }
    if (!bizType) { toast.error("Choose a business type"); return false; }
    if (bizType === "Other" && !bizOther.trim()) { toast.error("Describe your business type"); return false; }
    if (notes.length > 2000) { toast.error("Notes are too long"); return false; }
    return true;
  }

  const cost = s.credits_per_video;
  const balance = bal.data ?? 0;
  const enough = balance >= cost;

  async function confirm() {
    try { jobCost(s.credits_per_video, duration, s.max_video_seconds); } catch (e) { return toast.error(errMsg(e)); }
    if (!enough) return toast.error("Not enough credits");
    setBusy(true);
    try {
      let sourcePath: string | null = null;
      if (mode === "upload" && file) {
        setProgress("Uploading video…");
        sourcePath = `${user.id}/${crypto.randomUUID()}.mp4`;
        const { error } = await supabase.storage.from("source-videos").upload(sourcePath, file, { contentType: "video/mp4" });
        if (error) throw error;
      }
      setProgress("Uploading reference image…");
      const ext = image!.name.split(".").pop()?.toLowerCase() || "jpg";
      const imgPath = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from("reference-images").upload(imgPath, image!, { contentType: image!.type });
      if (up.error) throw up.error;
      setProgress("Creating your order…");
      const { data, error } = await supabase.rpc("create_job", {
        _source_type: (mode === "upload" ? "upload" : platform) as string,
        _source_url: mode === "link" ? url.trim() : "",
        _source_file_path: sourcePath as string,
        _clip_start: (platform === "youtube" ? parseMmSs(start) : null) as number,
        _clip_end: (platform === "youtube" ? parseMmSs(end) : null) as number,
        _target_duration_seconds: duration,
        _subject_type: subjectType,
        _subject_name: subjectName.trim(),
        _business_type: bizType === "Other" ? `Other: ${bizOther.trim()}` : bizType,
        _reference_image_path: imgPath,
        _notes: notes.trim(),
      });
      if (error) throw error;
      toast.success("Video ordered! We're on it.");
      qc.invalidateQueries();
      nav({ to: "/jobs/$jobId", params: { jobId: data as string } });
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); setProgress(null); }
  }

  const durationOptions = [10, 15, 20, 30].filter((d) => d <= s.max_video_seconds);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">New video</h1>
      <ol className="flex items-center gap-2">
        {STEPS.map((t, i) => (
          <li key={t} className="flex flex-1 items-center gap-2">
            <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-semibold", i < step ? "border-primary bg-primary text-primary-foreground" : i === step ? "border-primary text-primary" : "border-border text-muted-foreground")}>{i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}</span>
            <span className={cn("text-sm", i === step ? "font-medium" : "text-muted-foreground")}>{t}</span>
            {i < STEPS.length - 1 && <span className="h-px flex-1 bg-border" />}
          </li>
        ))}
      </ol>

      <Card><CardContent className="space-y-5 pt-6">
        {step === 0 && (
          <Tabs value={mode} onValueChange={(v) => setMode(v as "link" | "upload")}>
            <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="link"><Link2 className="h-4 w-4" />Paste link</TabsTrigger><TabsTrigger value="upload"><Upload className="h-4 w-4" />Upload MP4</TabsTrigger></TabsList>
            <TabsContent value="link" className="space-y-4 pt-4">
              <div className="space-y-2"><Label htmlFor="url">Video link</Label><Input id="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.tiktok.com/@…" />
                {url && <p className={cn("text-sm", platform ? "text-success" : "text-destructive")}>{platform ? `Detected: ${SOURCE_LABELS[platform]}` : "Unsupported link — use TikTok, YouTube Shorts, YouTube or Instagram Reels"}</p>}
              </div>
              {platform === "youtube" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Start (mm:ss, optional)</Label><Input value={start} onChange={(e) => setStart(e.target.value)} placeholder="0:00" /></div>
                  <div className="space-y-2"><Label>End (mm:ss, optional)</Label><Input value={end} onChange={(e) => setEnd(e.target.value)} placeholder="0:30" /></div>
                </div>
              )}
            </TabsContent>
            <TabsContent value="upload" className="space-y-3 pt-4">
              <Label htmlFor="vid" className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border p-8 text-center hover:bg-accent/40">
                <Upload className="h-6 w-6 text-primary" />
                <span className="text-sm">{file ? file.name : "Choose an MP4 (max 500 MB)"}</span>
                {fileDur != null && <span className="text-xs text-muted-foreground">Length: {formatMmSs(fileDur)}</span>}
              </Label>
              <input id="vid" type="file" accept="video/mp4" className="sr-only" onChange={(e) => onVideo(e.target.files?.[0] ?? null)} />
            </TabsContent>
          </Tabs>
        )}

        {step === 1 && (
          <>
            <div className="space-y-2"><Label>What should star in the video?</Label>
              <RadioGroup value={subjectType} onValueChange={(v) => setSubjectType(v as typeof subjectType)} className="grid grid-cols-3 gap-2">
                {(["person", "product", "business"] as const).map((t) => (
                  <Label key={t} className={cn("flex cursor-pointer items-center justify-center gap-2 rounded-lg border p-3 capitalize", subjectType === t ? "border-primary bg-accent" : "border-border")}><RadioGroupItem value={t} className="sr-only" />{t}</Label>
                ))}
              </RadioGroup>
            </div>
            <div className="space-y-2"><Label htmlFor="sn">Subject name</Label><Input id="sn" value={subjectName} onChange={(e) => setSubjectName(e.target.value)} placeholder={subjectType === "person" ? "e.g. Maria, our head chef" : subjectType === "product" ? "e.g. Signature burger" : "e.g. Blue Bay Realty"} /></div>
            <div className="space-y-2"><Label>Reference image</Label>
              <Label htmlFor="img" className="flex cursor-pointer items-center gap-4 rounded-xl border border-dashed border-border p-4 hover:bg-accent/40">
                {preview ? <img src={preview} alt="Reference preview" className="h-20 w-20 rounded-lg object-cover" /> : <span className="grid h-20 w-20 place-items-center rounded-lg bg-muted"><ImagePlus className="h-6 w-6 text-muted-foreground" /></span>}
                <span className="text-sm text-muted-foreground">{image ? image.name : "Clear photo of the subject — JPG, PNG or WebP, max 20 MB"}</span>
              </Label>
              <input id="img" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => onImage(e.target.files?.[0] ?? null)} />
            </div>
            <div className="space-y-2"><Label>Business type</Label>
              <Select value={bizType} onValueChange={setBizType}><SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger><SelectContent>{BUSINESS_TYPES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent></Select>
              {bizType === "Other" && <Input value={bizOther} onChange={(e) => setBizOther(e.target.value)} placeholder="Describe your business" maxLength={100} />}
            </div>
            <div className="space-y-2"><Label htmlFor="notes">Notes</Label><Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} placeholder="Text on screen, offers, tone, what to change from the original…" /></div>
          </>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="space-y-2"><Label>Target duration</Label>
              {clipLen ? (
                <div className="flex items-center gap-3"><Input type="number" min={1} max={s.max_video_seconds} value={duration} onChange={(e) => setDuration(Math.max(1, Math.min(s.max_video_seconds, Number(e.target.value) || 1)))} className="w-28" /><span className="text-sm text-muted-foreground">seconds (clip is {formatMmSs(clipLen)}, max {s.max_video_seconds}s)</span></div>
              ) : (
                <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent>{durationOptions.map((d) => <SelectItem key={d} value={String(d)}>{d} seconds</SelectItem>)}</SelectContent></Select>
              )}
            </div>
            <dl className="grid grid-cols-2 gap-3 rounded-xl bg-secondary p-4 text-sm">
              <dt className="text-muted-foreground">Estimated cost</dt><dd className="text-right font-medium">{cost} credit</dd>
              <dt className="col-span-2 -mt-2 text-xs text-muted-foreground">1 credit per video (up to {s.max_video_seconds}s, 1080p)</dt>
              <dt className="text-muted-foreground">Estimated turnaround</dt><dd className="text-right font-medium">{s.default_turnaround_hours} hours</dd>
              <dt className="text-muted-foreground">Current balance</dt><dd className="text-right font-medium">{balance}</dd>
              <dt className="text-muted-foreground">Balance after</dt><dd className={cn("text-right font-medium", !enough && "text-destructive")}>{balance - cost}</dd>
            </dl>
            <p className="text-sm text-muted-foreground">Includes up to {s.max_tries_per_video} tries per video.</p>
            {!enough && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">You don't have enough credits. <Link to="/credits" className="font-medium underline">Request credits</Link></p>}
            {progress && <div className="space-y-2"><p className="text-sm text-muted-foreground">{progress}</p><Progress value={progress.startsWith("Creating") ? 90 : 50} /></div>}
          </div>
        )}

        <div className="flex justify-between pt-2">
          <Button variant="ghost" disabled={step === 0 || busy} onClick={() => setStep(step - 1)}>Back</Button>
          {step < 2 ? (
            <Button onClick={() => { if ((step === 0 && validateSource()) || (step === 1 && validateSubject())) setStep(step + 1); }}>Continue</Button>
          ) : (
            <Button onClick={confirm} disabled={!enough || busy}>{busy ? "Submitting…" : `Confirm · ${cost} credit`}</Button>
          )}
        </div>
      </CardContent></Card>
    </div>
  );
}

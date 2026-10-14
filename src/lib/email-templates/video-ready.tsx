import { Body, Button, Container, Head, Heading, Html, Preview, Text } from "@react-email/components";

export interface VideoReadyProps {
  lang?: "en" | "es";
  name?: string;
  jobCode?: string;
  jobUrl?: string;
  brand?: string;
}

const copy = {
  en: { preview: "Your video is ready", title: "Your video is ready", hi: (n?: string) => (n ? `Hi ${n},` : "Hi there,"), body: (c: string) => `Your finished video ${c} is ready to watch and download.`, cta: "View video" },
  es: { preview: "Tu video está listo", title: "Tu video está listo", hi: (n?: string) => (n ? `Hola ${n}:` : "Hola:"), body: (c: string) => `Tu video terminado ${c} ya está listo para ver y descargar.`, cta: "Ver video" },
};

export function videoReadySubject(lang: "en" | "es" = "en", brand = "Studio") {
  return lang === "es" ? `${brand}: tu video está listo` : `${brand}: your video is ready`;
}

export const VideoReadyEmail = ({ lang = "en", name, jobCode = "", jobUrl, brand = "Studio" }: VideoReadyProps) => {
  const c = copy[lang] ?? copy.en;
  return (
    <Html lang={lang} dir="ltr">
      <Head />
      <Preview>{c.preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={brandStyle}>{brand}</Text>
          <Heading style={h1}>{c.title}</Heading>
          <Text style={text}>{c.hi(name)}</Text>
          <Text style={text}>{c.body(jobCode)}</Text>
          {jobUrl && <Button href={jobUrl} style={button}>{c.cta}</Button>}
        </Container>
      </Body>
    </Html>
  );
};

export const template = {
  component: VideoReadyEmail,
  subject: (d: VideoReadyProps) => videoReadySubject(d.lang, d.brand),
  displayName: "Video ready (ES/EN)",
  previewData: { lang: "en", name: "Jane", jobCode: "JOB-000123", jobUrl: "https://example.com/jobs/1", brand: "Studio" } as VideoReadyProps,
};

const main = { backgroundColor: "#ffffff", fontFamily: "Arial, sans-serif" };
const container = { padding: "24px 28px", maxWidth: "520px" };
const brandStyle = { fontSize: "14px", fontWeight: 700, color: "#111827" };
const h1 = { fontSize: "22px", color: "#111827", margin: "16px 0" };
const text = { fontSize: "15px", lineHeight: "22px", color: "#374151" };
const button = { backgroundColor: "#111827", color: "#ffffff", padding: "12px 20px", borderRadius: "8px", fontSize: "14px", textDecoration: "none" };

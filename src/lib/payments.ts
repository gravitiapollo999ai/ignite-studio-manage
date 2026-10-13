import { supabase } from "@/integrations/supabase/client";

export type CreditPurchaseInput = { userId: string; packageId: string; credits: number; message?: string };
export type CreditPurchaseResult = { kind: "pending_review" } | { kind: "redirect"; url: string };

/** Pluggable payment provider. "manual" creates a pending request an admin approves.
 *  A future "stripe" provider can return { kind: "redirect", url } to Checkout without UI changes. */
export interface PaymentProvider {
  id: string;
  /** Call-site translatable CTA label: ctaLabel((en, es) => lang === "es" ? es : en) */
  ctaLabel: (t: (en: string, es: string) => string) => string;
  start(input: CreditPurchaseInput): Promise<CreditPurchaseResult>;
}

export const manualProvider: PaymentProvider = {
  id: "manual",
  ctaLabel: (t) => t("Send request", "Enviar solicitud"),
  async start({ userId, packageId, credits, message }) {
    const { error } = await supabase.from("credit_requests").insert({
      user_id: userId,
      package_id: packageId,
      credits,
      client_message: message || null,
      payment_provider: "manual",
    });
    if (error) throw error;
    return { kind: "pending_review" };
  },
};

export const paymentProvider: PaymentProvider = manualProvider;

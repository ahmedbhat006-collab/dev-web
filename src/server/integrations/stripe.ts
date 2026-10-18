import Stripe from "stripe";

export type StripeCreds = { secretKey: string; webhookSecret: string };

export function stripeClient(creds: StripeCreds) {
  return new Stripe(creds.secretKey, { maxNetworkRetries: 2, timeout: 15_000 });
}

/** Plain-English message for a Stripe error. */
export function explainStripeError(e: unknown) {
  const err = e as { type?: string; message?: string; statusCode?: number };
  if (err?.type === "StripeAuthenticationError") return "The Stripe secret key is invalid. Update it in Settings > Integrations.";
  if (err?.type === "StripeConnectionError") return "Couldn't reach Stripe. Please try again in a moment.";
  if (err?.type === "StripeRateLimitError") return "Stripe is rate limiting requests. Please try again shortly.";
  return err?.message || "Stripe rejected the request.";
}

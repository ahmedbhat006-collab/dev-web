import { z } from "zod";
import { prisma } from "../db";
import { HttpError } from "../http";
import { createLead } from "./leads";
import { phoneSchema } from "../schemas";

// Google Gemini (free tier) via its REST API. The key stays on the server.
// "-latest" aliases follow Google's current model, so the bot keeps working when pinned versions are retired.
// Flash-Lite replies in ~1-2s on the free tier, which suits live chat. Override with GEMINI_MODEL in .env.
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";
export const ASSISTANT_MODEL_LABEL = "Google Gemini Flash-Lite";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export const assistantConfigured = () => !!process.env.GEMINI_API_KEY;

export const DEFAULT_ASSISTANT_INFO = `We are a solar energy company serving homes and businesses.
Services: residential rooftop solar (3–15 kW), commercial solar projects, net-metering paperwork, battery backup, and annual maintenance.
Typical pricing: residential systems start around PKR 450,000 for 5 kW; exact quotes need a free site survey.
Process: free consultation → site survey → proposal → installation (usually 2–4 weeks) → net-metering.
Service areas: Lahore, Karachi, Islamabad, Faisalabad.
Hours: our team replies Monday–Saturday, 9am–7pm PKT; this assistant answers 24/7.`;

/** The one tool the assistant has: hand a real lead to the sales team. */
const TOOLS = [
  {
    functionDeclarations: [
      {
        name: "capture_lead",
        description:
          "Create a sales lead so a human employee contacts the visitor. Call this once, as soon as the visitor has given their name AND at least one of phone or email and wants to be contacted (a quote, a site survey, a call back, or a question you cannot answer). Do not call it again after it succeeds.",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "Visitor's full name" },
            phone: { type: "string", description: "Phone in international format, e.g. +923001234567. Empty string if not given." },
            email: { type: "string", description: "Email address. Empty string if not given." },
            message: { type: "string", description: "One or two sentences summarizing what the visitor needs, in English." },
          },
          required: ["name", "phone", "email", "message"],
        },
      },
    ],
  },
];

function systemPrompt(company: string, info: string) {
  return `You are the 24/7 website assistant for ${company}. You chat with potential customers on the company's public contact page.

What you know about ${company} (the only facts you may state about the company):
<company_info>
${info}
</company_info>

How to help:
- Answer briefly and warmly in 1–4 short sentences, in the language the visitor writes in (English, Urdu or Roman Urdu).
- Use only the company info above for prices, services, timelines and areas. If something isn't covered, say a team member will confirm it, and offer to arrange a call back.
- Your goal is that no interested visitor is lost: when someone wants a quote, survey or call, or asks something you can't answer, ask for their name and a phone number or email, then call capture_lead.
- After capture_lead succeeds, tell them which team member has been assigned (the tool result says who) and that they'll be contacted shortly.
- Never ask for card numbers or passwords. Never invent discounts. Plain text only, no markdown.`;
}

const leadInput = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().max(40).optional().default(""),
  email: z.string().max(200).optional().default(""),
  message: z.string().trim().max(1000).optional().default(""),
});

type ChatTurn = { role: "user" | "assistant"; content: string };
type Part = { text?: string; functionCall?: { name: string; args?: Record<string, unknown> }; functionResponse?: unknown; thought?: boolean; thoughtSignature?: string };
type Content = { role: "user" | "model"; parts: Part[] };

/** In-memory guard so one chat session never creates two leads (fine for a single-instance deploy). */
const g = globalThis as unknown as { __chatLeads?: Map<string, { leadId: string; owner: string | null }> };
const chatLeads = (g.__chatLeads ??= new Map());

async function captureLead(workspaceId: string, chatId: string, raw: unknown, transcript: ChatTurn[]) {
  const existing = chatLeads.get(chatId);
  if (existing) return { ok: true, alreadyCaptured: true, assignedTo: existing.owner };
  const parsed = leadInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Missing the visitor's name. Ask for it." };
  const email = parsed.data.email.trim();
  const phoneRes = phoneSchema.safeParse(parsed.data.phone);
  const phone = phoneRes.success ? phoneRes.data : null;
  const emailOk = z.string().email().safeParse(email).success;
  if (!phone && !emailOk) return { ok: false, error: "Need a valid phone number (international format, e.g. +923001234567) or email. Ask the visitor for one." };

  const recent = transcript.slice(-6).map((t) => `${t.role === "user" ? "Visitor" : "Assistant"}: ${t.content}`).join("\n");
  const lead = await createLead({
    workspaceId,
    source: "CHATBOT",
    name: parsed.data.name,
    phone,
    email: emailOk ? email : null,
    message: `${parsed.data.message}\n\n— From AI chat —\n${recent}`.slice(0, 2000),
    actor: { id: null, name: "AI assistant" },
  });
  const full = await prisma.lead.findUnique({ where: { id: lead.id }, include: { assignee: { select: { name: true } } } });
  const owner = full?.assignee?.name?.split(" ")[0] ?? null;
  chatLeads.set(chatId, { leadId: lead.id, owner });
  return { ok: true, assignedTo: owner ?? "our team" };
}

async function callGemini(body: unknown): Promise<{ parts: Part[]; finishReason?: string }> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    throw new HttpError(503, "Couldn't reach our assistant. Please try again, or use the form.");
  }
  const data = (await res.json().catch(() => ({}))) as {
    candidates?: { content?: { parts?: Part[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
    error?: { message?: string; status?: string };
  };
  if (!res.ok) {
    console.error("[assistant] Gemini error", res.status, data.error?.message);
    if (res.status === 429) throw new HttpError(429, "Lots of people are chatting right now. Please try again in a moment, or use the form.");
    if (res.status === 400 && /API key/i.test(data.error?.message ?? "")) throw new HttpError(503, "Our assistant is offline right now (configuration issue). Please use the form.", { offline: true });
    if (res.status === 401 || res.status === 403) throw new HttpError(503, "Our assistant is offline right now (configuration issue). Please use the form.", { offline: true });
    throw new HttpError(502, "Our assistant hit a problem. Please try again, or use the form.");
  }
  const cand = data.candidates?.[0];
  return { parts: cand?.content?.parts ?? [], finishReason: cand?.finishReason ?? data.promptFeedback?.blockReason };
}

export async function chat(slug: string, chatId: string, history: ChatTurn[]) {
  const ws = await prisma.workspace.findUnique({ where: { slug } });
  if (!ws) throw new HttpError(404, "This chat isn't available.");
  if (!assistantConfigured()) throw new HttpError(503, "Our assistant is offline right now. Please use the form and we'll get back to you.", { offline: true });

  const contents: Content[] = history.map((t) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.content }] }));
  const base = {
    systemInstruction: { parts: [{ text: systemPrompt(ws.name, ws.assistantInfo?.trim() || DEFAULT_ASSISTANT_INFO) }] },
    tools: TOOLS,
    generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
  };
  let leadCaptured = false;
  let assignedTo: string | null = null;

  for (let step = 0; step < 4; step++) {
    const { parts, finishReason } = await callGemini({ ...base, contents });
    if (finishReason === "SAFETY" || finishReason === "PROHIBITED_CONTENT" || finishReason === "BLOCKLIST") {
      return { reply: "Sorry, I can't help with that. If you'd like, share your name and number and a team member will contact you.", leadCaptured, assignedTo };
    }
    const calls = parts.filter((p) => p.functionCall);
    if (!calls.length) {
      const text = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("").trim();
      return { reply: text || "Could you tell me a little more about what you need?", leadCaptured, assignedTo };
    }
    // Send the model's turn back unchanged (keeps any thought signatures), then the tool results.
    contents.push({ role: "model", parts });
    const responses: Part[] = [];
    for (const p of calls) {
      const fc = p.functionCall!;
      let result: Record<string, unknown>;
      if (fc.name !== "capture_lead") result = { ok: false, error: "Unknown tool" };
      else {
        try {
          result = await captureLead(ws.id, chatId, fc.args ?? {}, history);
          if (result.ok) { leadCaptured = true; assignedTo = (result.assignedTo as string) ?? null; }
        } catch (e) {
          console.error("[assistant] capture_lead failed", e);
          result = { ok: false, error: "Saving the request failed. Apologize and ask them to use the form on this page." };
        }
      }
      responses.push({ functionResponse: { name: fc.name, response: result } });
    }
    contents.push({ role: "user", parts: responses });
  }
  return { reply: "Thanks! A team member will follow up with you shortly.", leadCaptured, assignedTo };
}

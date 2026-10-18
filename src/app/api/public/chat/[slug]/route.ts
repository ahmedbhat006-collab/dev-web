import { z } from "zod";
import { route, body, HttpError } from "@/server/http";
import { prisma } from "@/server/db";
import { chat, assistantConfigured } from "@/server/services/assistant";

export const GET = route(async (_req, { params }) => {
  const { slug } = await params;
  const ws = await prisma.workspace.findUnique({ where: { slug }, select: { name: true } });
  if (!ws) throw new HttpError(404, "Not found.");
  return { company: ws.name, online: assistantConfigured() };
});

const schema = z.object({
  chatId: z.string().min(8).max(64),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(2000) }))
    .min(1)
    .max(30),
});

/** Public 24/7 assistant. No login; rate limited per IP; the API key never leaves the server. */
export const POST = route(
  async (req, { params }) => {
    const { slug } = await params;
    const b = await body(req, schema);
    if (b.messages[0].role !== "user" || b.messages[b.messages.length - 1].role !== "user")
      throw new HttpError(400, "Conversation must start and end with a visitor message.");
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const key = `chat:${ip}`;
    const recent = await prisma.loginAttempt.count({ where: { key, createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) } } });
    if (recent >= 40) throw new HttpError(429, "You're sending messages very quickly. Please wait a few minutes.");
    await prisma.loginAttempt.create({ data: { key, success: true } });
    return chat(slug, b.chatId, b.messages);
  },
  { csrf: false },
);

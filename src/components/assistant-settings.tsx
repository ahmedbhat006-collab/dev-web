"use client";

import { useEffect, useState } from "react";
import { Bot, ExternalLink } from "lucide-react";
import { api, useAction, useApi } from "@/lib/client";
import { Badge, Button, Card, Textarea } from "./ui";

export function AssistantSettings() {
  const { data, mutate } = useApi<{ info: string; online: boolean; slug: string; model: string }>("/api/workspace/assistant");
  const [info, setInfo] = useState("");
  const { pending, run } = useAction();
  useEffect(() => { if (data) setInfo(data.info); }, [data]);
  if (!data) return null;
  return (
    <Card>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg border border-line bg-surface-2"><Bot className="size-5" /></span>
          <div>
            <p className="text-[15px] font-semibold">AI chat assistant</p>
            <p className="text-xs text-muted">{data.model} · answers visitors 24/7 on your public page and turns them into leads</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={data.online ? "success" : "neutral"} dot>{data.online ? "Online" : "Not connected"}</Badge>
          <a href={`/f/${data.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] text-accent hover:underline">Try it <ExternalLink className="size-3" /></a>
        </div>
      </div>
      {!data.online && <p className="mt-3 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">Set GEMINI_API_KEY in the server .env and restart to bring the assistant online. Until then visitors see an &quot;offline, please use the form&quot; message.</p>}
      <label htmlFor="assistant-info" className="mt-4 block text-[13px] font-medium">What the assistant knows about your company</label>
      <p className="mb-2 text-xs text-muted">Services, prices, areas and hours. It only states facts written here, and hands everything else to your team as a lead.</p>
      <Textarea id="assistant-info" rows={8} value={info} onChange={(e) => setInfo(e.target.value)} className="font-mono text-[12.5px]" />
      <div className="mt-3 flex justify-end">
        <Button variant="primary" loading={pending} disabled={info === data.info} onClick={() => run(() => api("/api/workspace/assistant", { method: "PUT", body: { info } }), { success: "Assistant knowledge saved" }).then(() => mutate()).catch(() => null)}>Save</Button>
      </div>
    </Card>
  );
}

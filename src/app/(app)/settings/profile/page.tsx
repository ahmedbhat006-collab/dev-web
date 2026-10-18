"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, CircleCheck, TriangleAlert, Mail, Unplug } from "lucide-react";
import { useApi, api, useAction, refresh } from "@/lib/client";
import { Card, CardHeader, Field, Input, Select, Button, Badge } from "@/components/ui";
import { ThemeSegmented } from "@/components/theme-toggle";
import { useMe } from "@/components/me";
import { tzAbbr } from "@/lib/tz";

type U = { id: string; name: string; email?: string; notifyEmail?: string | null; timezone: string; calendar: string };

const ZONES = ["Asia/Karachi", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Europe/London", "Europe/Berlin", "America/New_York", "America/Chicago", "America/Los_Angeles", "UTC"];

export default function ProfilePage() {
  return <Suspense><Profile /></Suspense>;
}

function Profile() {
  const me = useMe();
  const sp = useSearchParams();
  const { data: users, mutate } = useApi<U[]>("/api/users");
  const mine = users?.find((u) => u.id === me.id);
  const { data: integ } = useApi<{ google: { configured: boolean } }>(me.can("integrations.manage") ? "/api/integrations" : null);
  const [f, setF] = useState({ name: me.name, notifyEmail: "", timezone: me.timezone });
  const { pending, run } = useAction();

  useEffect(() => { if (mine) setF((s) => ({ ...s, notifyEmail: mine.notifyEmail ?? "", timezone: mine.timezone })); }, [mine]);
  useEffect(() => {
    const g = sp.get("google");
    if (!g) return;
    const msg: Record<string, [string, "success" | "error"]> = {
      connected: ["Google Calendar connected", "success"],
      denied: ["Google access was not granted", "error"],
      failed: ["Couldn't connect Google Calendar. Check that your account is a test user of the Google app.", "error"],
      invalid_state: ["The Google sign-in link expired. Please try again.", "error"],
    };
    const [m, t] = msg[g] ?? ["", "success"];
    if (m) toast[t](m);
    window.history.replaceState(null, "", "/settings/profile");
  }, [sp]);

  const save = () => run(() => api("/api/me", { method: "PATCH", body: f }), { success: "Profile saved" }).then(() => { mutate(); refresh("/api/"); }).catch(() => null);
  const disconnect = () => run(() => api("/api/integrations/google/disconnect", { body: {} }), { success: "Google Calendar disconnected" }).then(() => mutate()).catch(() => null);
  const zones = [...new Set([f.timezone, ...ZONES])];

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader title="Your profile" description="How you appear to teammates and where escalation alerts go." />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Login email" hint="Contact your Owner to change it."><Input value={me.email} disabled /></Field>
          <Field label="Escalation alert email" hint={<span className="inline-flex items-center gap-1"><Mail className="size-3" />Leave empty to use your login email.</span>}>
            <Input type="email" value={f.notifyEmail} onChange={(e) => setF({ ...f, notifyEmail: e.target.value })} placeholder={me.email} />
          </Field>
          <Field label="Time zone" hint="Appointment times are shown in this zone.">
            <Select value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })}>
              {zones.map((z) => <option key={z} value={z}>{z.replace("_", " ")} ({tzAbbr(z)})</option>)}
            </Select>
          </Field>
        </div>
        <div className="mt-5 flex justify-end"><Button variant="primary" loading={pending} onClick={save}>Save profile</Button></div>
      </Card>

      <Card>
        <CardHeader title="Google Calendar" description="Connect your own calendar so customers can be booked with you. Tokens are stored encrypted on the server only." />
        <div className="flex flex-col gap-4 rounded-lg border border-line p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-accent/10 text-accent"><CalendarDays className="size-5" /></span>
            <div>
              <p className="text-sm font-medium">Google Calendar</p>
              {mine?.calendar === "CONNECTED" && <Badge tone="success" dot>Connected</Badge>}
              {mine?.calendar === "NEEDS_RECONNECT" && <Badge tone="danger"><TriangleAlert className="size-3" />Needs reconnecting</Badge>}
              {mine?.calendar === "NOT_CONNECTED" && <Badge>Not connected. You can't be booked yet.</Badge>}
            </div>
          </div>
          <div className="flex gap-2">
            {mine?.calendar !== "CONNECTED" ? (
              <a href="/api/integrations/google/connect" className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3.5 text-sm font-medium text-accent-fg shadow-soft hover:bg-accent-hover">
                <CircleCheck className="size-4" />{mine?.calendar === "NEEDS_RECONNECT" ? "Reconnect" : "Connect Google Calendar"}
              </a>
            ) : (
              <Button variant="danger" icon={<Unplug className="size-4" />} loading={pending} onClick={disconnect}>Disconnect</Button>
            )}
          </div>
        </div>
        {integ && !integ.google.configured && <p className="mt-3 text-xs text-warning">GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET aren&apos;t set on the server yet, so connecting will fail.</p>}
      </Card>

      <Card>
        <CardHeader title="Appearance" description="Light, dark, or match your system." />
        <div className="max-w-sm"><ThemeSegmented /></div>
      </Card>
    </div>
  );
}

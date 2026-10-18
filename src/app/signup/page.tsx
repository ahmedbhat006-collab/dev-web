"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { AuthLayout } from "@/components/auth-layout";
import { Button, Field, Input } from "@/components/ui";
import { api } from "@/lib/client";

export default function SignupPage() {
  const router = useRouter();
  const [f, setF] = useState({ companyName: "", name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api("/api/auth/signup", { body: { ...f, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } });
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Create your workspace"
      subtitle="You'll be the Owner. Invite your team next."
      footer={<>Already have an account? <Link href="/login" className="font-medium text-accent hover:underline">Sign in</Link></>}
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label="Company name">
          <Input value={f.companyName} onChange={set("companyName")} placeholder="Sunrise Solar" required className="h-10" autoComplete="organization" />
        </Field>
        <Field label="Your name">
          <Input value={f.name} onChange={set("name")} placeholder="Ayesha Khan" required className="h-10" autoComplete="name" />
        </Field>
        <Field label="Work email">
          <Input type="email" value={f.email} onChange={set("email")} placeholder="you@company.com" required className="h-10" autoComplete="email" />
        </Field>
        <Field label="Password" hint="At least 8 characters.">
          <Input type="password" value={f.password} onChange={set("password")} placeholder="••••••••" required minLength={8} className="h-10" autoComplete="new-password" />
        </Field>
        {error && <p role="alert" className="rounded-lg border border-danger/20 bg-danger/8 px-3 py-2 text-[13px] text-danger">{error}</p>}
        <Button type="submit" variant="primary" size="lg" loading={loading} className="mt-2 w-full">Create workspace</Button>
      </form>
    </AuthLayout>
  );
}

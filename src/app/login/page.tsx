"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { AuthLayout } from "@/components/auth-layout";
import { Button, Field, Input } from "@/components/ui";
import { api } from "@/lib/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api("/api/auth/login", { body: { email, password } });
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Good to see you again."
      footer={<>New to Dastak? <Link href="/signup" className="font-medium text-accent hover:underline">Create a workspace</Link></>}
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label="Work email">
          <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required className="h-11 rounded-full px-4" />
        </Field>
        <Field label="Password">
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required className="h-11 rounded-full px-4" />
        </Field>
        {error && <p role="alert" className="rounded-2xl border border-danger/20 bg-danger/8 px-3 py-2 text-[13px] text-danger">{error}</p>}
        <Button type="submit" variant="primary" size="lg" loading={loading} className="mt-2 w-full rounded-full">Sign in</Button>
      </form>
    </AuthLayout>
  );
}

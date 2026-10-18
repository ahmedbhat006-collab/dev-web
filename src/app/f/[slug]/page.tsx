"use client";

import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { CircleCheck } from "lucide-react";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { BrandMark } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { api } from "@/lib/client";
import { ChatWidget } from "@/components/chat-widget";

export default function PublicForm() {
  const { slug } = useParams<{ slug: string }>();
  const [ws, setWs] = useState<{ name: string } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [f, setF] = useState({ name: "", email: "", phone: "", company: "", message: "", website: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api<{ name: string }>(`/api/public/forms/${slug}`).then(setWs).catch(() => setNotFound(true));
  }, [slug]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api(`/api/public/forms/${slug}`, { body: f });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-bg">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <div className="mx-auto max-w-xl px-5 py-14 sm:py-20">
        <div className="mb-8 flex items-center gap-3">
          <BrandMark className="size-10" />
          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-subtle font-semibold">Get in touch</p>
            <h1 className="text-xl font-semibold tracking-tight">{notFound ? "Form not found" : ws?.name ?? " "}</h1>
          </div>
        </div>
        <div className="rounded-lg border border-line bg-surface p-6 shadow-float sm:p-8">
          {notFound ? (
            <p className="text-sm text-muted">This form link is not valid. Please check the address.</p>
          ) : done ? (
            <div className="flex flex-col items-center py-8 text-center animate-pop">
              <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-success/10 text-success"><CircleCheck className="size-6" /></span>
              <h2 className="text-lg font-semibold">Thanks, we've got it.</h2>
              <p className="mt-1.5 text-sm text-muted max-w-sm">A member of the {ws?.name} team has already been assigned and will reach out shortly.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
              <Field label="Full name" required className="sm:col-span-2"><Input value={f.name} onChange={set("name")} required autoComplete="name" /></Field>
              <Field label="Email"><Input type="email" value={f.email} onChange={set("email")} autoComplete="email" /></Field>
              <Field label="Phone (WhatsApp)" hint="International format, e.g. +92 300 1234567"><Input type="tel" value={f.phone} onChange={set("phone")} autoComplete="tel" /></Field>
              <Field label="Company" className="sm:col-span-2"><Input value={f.company} onChange={set("company")} autoComplete="organization" /></Field>
              <Field label="How can we help?" className="sm:col-span-2"><Textarea rows={4} value={f.message} onChange={set("message")} /></Field>
              <input type="text" name="website" value={f.website} onChange={set("website")} className="hidden" tabIndex={-1} autoComplete="off" aria-hidden />
              {error && <p role="alert" className="sm:col-span-2 rounded-lg border border-danger/20 bg-danger/8 px-3 py-2 text-[13px] text-danger">{error}</p>}
              <div className="sm:col-span-2">
                <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full">Send message</Button>
                <p className="mt-3 text-center text-xs text-subtle">We reply within minutes during business hours.</p>
              </div>
            </form>
          )}
        </div>
      </div>
      {!notFound && <ChatWidget slug={slug} />}
    </div>
  );
}

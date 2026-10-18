import { z } from "zod";
import { ALL_PERMISSIONS } from "@/lib/permissions";

export const permsSchema = z.array(z.enum(ALL_PERMISSIONS as [string, ...string[]])).max(50);

export const pageParams = (q: Record<string, string>) => {
  const page = Math.max(1, Number(q.page) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(q.pageSize) || 25));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
};

export const phoneSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/[\s\-().]/g, ""))
  .refine((s) => s === "" || /^\+?[1-9]\d{6,14}$/.test(s), "Enter the phone in international format, e.g. +923001234567")
  .transform((s) => (s === "" ? null : s.startsWith("+") ? s : `+${s}`));

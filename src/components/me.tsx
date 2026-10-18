"use client";

import { createContext, ReactNode, useContext } from "react";
import type { Me } from "@/server/me";
import type { Permission } from "@/lib/permissions";

const Ctx = createContext<Me | null>(null);

export function MeProvider({ me, children }: { me: Me; children: ReactNode }) {
  return <Ctx.Provider value={me}>{children}</Ctx.Provider>;
}

export function useMe() {
  const me = useContext(Ctx);
  if (!me) throw new Error("useMe outside MeProvider");
  return {
    ...me,
    can: (p: Permission) => me.perms.includes(p),
    seesAll: me.perms.includes("records.view_all"),
  };
}

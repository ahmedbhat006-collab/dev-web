import { redirect } from "next/navigation";
import { loadMe } from "@/server/me";
import { MeProvider } from "@/components/me";
import { Shell } from "@/components/shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await loadMe();
  if (!me) redirect("/login");
  return (
    <MeProvider me={me}>
      <Shell>{children}</Shell>
    </MeProvider>
  );
}

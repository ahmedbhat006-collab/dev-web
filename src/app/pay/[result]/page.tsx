import { CircleCheck, CircleX } from "lucide-react";
import { BrandMark } from "@/components/brand";

export default async function PayResult({ params }: { params: Promise<{ result: string }> }) {
  const { result } = await params;
  const ok = result === "success";
  return (
    <div className="min-h-dvh flex items-center justify-center px-5">
      <div className="w-full max-w-sm rounded-lg border border-line bg-surface p-8 text-center shadow-float">
        <BrandMark className="size-9 mx-auto mb-6" />
        <span className={`mx-auto mb-4 flex size-12 items-center justify-center rounded-full ${ok ? "bg-success/10 text-success" : "bg-surface-2 text-muted"}`}>
          {ok ? <CircleCheck className="size-6" /> : <CircleX className="size-6" />}
        </span>
        <h1 className="text-lg font-semibold">{ok ? "Payment received" : "Payment not completed"}</h1>
        <p className="mt-1.5 text-sm text-muted">
          {ok ? "Thank you! Your payment was processed securely by Stripe. You can close this page." : "No charge was made. You can use the same link again while it's still valid."}
        </p>
      </div>
    </div>
  );
}

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAgencyAdmin } from "@/lib/auth/admin";
import { OnboardingForm } from "./OnboardingForm";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  await requireAgencyAdmin();

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
      >
        <ArrowLeft className="h-4 w-4" />
        All clients
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">
        Add a client
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        Map the client&apos;s data sources, optionally invite them, then seed up
        to 16 months of GSC/GA4 history.
      </p>
      <OnboardingForm />
    </main>
  );
}

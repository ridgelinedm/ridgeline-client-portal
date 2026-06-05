"use client";

import { useState } from "react";
import Link from "next/link";

type Fields = {
  name: string;
  slug: string;
  gsc_property: string;
  ga4_property_id: string;
  ahrefs_domain: string;
  gbp_location_id: string;
  logo_url: string;
  primary_color: string;
  tags: string;
  inviteEmail: string;
};

const EMPTY: Fields = {
  name: "",
  slug: "",
  gsc_property: "",
  ga4_property_id: "",
  ahrefs_domain: "",
  gbp_location_id: "",
  logo_url: "",
  primary_color: "#6366f1",
  tags: "",
  inviteEmail: "",
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addMonths(d: Date, n: number): Date {
  const c = new Date(d);
  c.setUTCMonth(c.getUTCMonth() + n);
  return c;
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setUTCDate(c.getUTCDate() + n);
  return c;
}

// Split [start, end] into adjacent calendar-month windows (mirrors
// scripts/backfill-workspace.mjs so the onboarding UI and the script behave the
// same against /api/admin/backfill).
function monthlyWindows(
  startIso: string,
  endIso: string,
): { start: string; end: string }[] {
  const start = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  const out: { start: string; end: string }[] = [];
  let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  while (cursor <= end) {
    const next = addMonths(cursor, 1);
    const winStart = cursor < start ? start : cursor;
    const winEnd = addDays(next, -1) > end ? end : addDays(next, -1);
    out.push({ start: isoDate(winStart), end: isoDate(winEnd) });
    cursor = next;
  }
  return out;
}

type Created = { id: string; slug: string; name: string };

export function OnboardingForm() {
  const [f, setF] = useState<Fields>(EMPTY);
  const [slugTouched, setSlugTouched] = useState(false);
  const [phase, setPhase] = useState<
    "form" | "creating" | "created" | "backfilling" | "done"
  >("form");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [inviteNote, setInviteNote] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");

  const set = (k: keyof Fields, v: string) =>
    setF((prev) => ({ ...prev, [k]: v }));

  const canBackfill = Boolean(created && (f.gsc_property || f.ga4_property_id));

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPhase("creating");
    try {
      const res = await fetch("/api/admin/workspaces", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: f.name,
          slug: f.slug || slugify(f.name),
          gsc_property: f.gsc_property,
          ga4_property_id: f.ga4_property_id,
          ahrefs_domain: f.ahrefs_domain,
          gbp_location_id: f.gbp_location_id,
          logo_url: f.logo_url,
          primary_color: f.primary_color,
          tags: f.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          inviteEmail: f.inviteEmail || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to create client");
        setPhase("form");
        return;
      }
      setCreated(json.workspace);
      if (json.invite && !json.invite.ok) {
        setInviteNote(
          `Client created, but the invite failed (${json.invite.error}). You can re-invite later.`,
        );
      } else if (json.invite?.ok) {
        setInviteNote(`Invite sent to ${f.inviteEmail}.`);
      }
      setPhase("created");
    } catch (err) {
      setError((err as Error).message);
      setPhase("form");
    }
  }

  async function handleBackfill() {
    if (!created) return;
    setError(null);
    setPhase("backfilling");
    setProgress(0);
    try {
      const today = new Date();
      const overallEnd = isoDate(today);
      const overallStart = isoDate(addMonths(today, -16));
      const windows = monthlyWindows(overallStart, overallEnd);

      // Pull each month-window (GSC + GA4) through the admin backfill endpoint —
      // one request per window keeps each inside the 60s function budget.
      for (let i = 0; i < windows.length; i++) {
        const w = windows[i];
        const res = await fetch("/api/admin/backfill", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            workspace_id: created.id,
            start_date: w.start,
            end_date: w.end,
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setError(j.error ?? `Backfill failed (${res.status})`);
          setPhase("created");
          return;
        }
        setProgress(Math.round(((i + 1) / windows.length) * 100));
        setProgressLabel(`through ${w.end}`);
      }

      // Seed the latest health row so the client dashboard renders immediately.
      await fetch("/api/admin/recompute-health", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspace_id: created.id,
          start_date: overallEnd,
          end_date: overallEnd,
        }),
      });

      setProgress(100);
      setPhase("done");
    } catch (err) {
      setError((err as Error).message);
      setPhase("created");
    }
  }

  if (phase === "done" && created) {
    return (
      <div className="mt-8 rounded-xl border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-900 dark:bg-emerald-950/30">
        <h2 className="text-lg font-semibold text-emerald-800 dark:text-emerald-300">
          {created.name} is ready
        </h2>
        <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-400">
          History seeded and a current snapshot taken. The daily refresh will
          keep it growing from here.
        </p>
        <div className="mt-4 flex gap-2">
          <Link
            href={`/${created.slug}`}
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
          >
            View dashboard
          </Link>
          <button
            onClick={() => {
              setF(EMPTY);
              setSlugTouched(false);
              setCreated(null);
              setInviteNote(null);
              setProgress(0);
              setPhase("form");
            }}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
          >
            Add another
          </button>
          <Link
            href="/admin"
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
          >
            All clients
          </Link>
        </div>
      </div>
    );
  }

  if (phase === "created" || phase === "backfilling") {
    return (
      <div className="mt-8 space-y-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-semibold">{created?.name} created</h2>
          {inviteNote && (
            <p className="mt-1 text-sm text-zinc-500">{inviteNote}</p>
          )}
          {phase === "backfilling" ? (
            <div className="mt-4">
              <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
                <div
                  className="h-full bg-indigo-500 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-zinc-500">
                Seeding history — {progress}% {progressLabel}
              </p>
            </div>
          ) : (
            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={handleBackfill}
                disabled={!canBackfill}
                className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-zinc-900"
              >
                Run 16-month backfill
              </button>
              <Link
                href={`/${created?.slug}`}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
              >
                Skip — view dashboard
              </Link>
              {!canBackfill && (
                <span className="text-xs text-zinc-400">
                  Add a GSC or GA4 source to enable backfill
                </span>
              )}
            </div>
          )}
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>
      </div>
    );
  }

  // phase === "form" | "creating"
  return (
    <form onSubmit={handleCreate} className="mt-8 space-y-5">
      <Section title="Basics">
        <Field label="Client name" required>
          <input
            required
            value={f.name}
            onChange={(e) => {
              set("name", e.target.value);
              if (!slugTouched) set("slug", slugify(e.target.value));
            }}
            placeholder="Acme Co"
            className={inputCls}
          />
        </Field>
        <Field label="URL slug" required>
          <input
            required
            value={f.slug}
            onChange={(e) => {
              setSlugTouched(true);
              set("slug", slugify(e.target.value));
            }}
            placeholder="acme-co"
            className={inputCls}
          />
        </Field>
      </Section>

      <Section title="Data sources">
        <Field label="GSC property" hint="e.g. sc-domain:acme.com">
          <input
            value={f.gsc_property}
            onChange={(e) => set("gsc_property", e.target.value)}
            placeholder="sc-domain:acme.com"
            className={inputCls}
          />
        </Field>
        <Field label="GA4 property ID" hint="numeric, e.g. 123456789">
          <input
            value={f.ga4_property_id}
            onChange={(e) => set("ga4_property_id", e.target.value)}
            placeholder="123456789"
            className={inputCls}
          />
        </Field>
        <Field label="Ahrefs domain" hint="e.g. acme.com">
          <input
            value={f.ahrefs_domain}
            onChange={(e) => set("ahrefs_domain", e.target.value)}
            placeholder="acme.com"
            className={inputCls}
          />
        </Field>
        <Field label="GBP location ID" hint="stored now, wired when API access clears">
          <input
            value={f.gbp_location_id}
            onChange={(e) => set("gbp_location_id", e.target.value)}
            placeholder="locations/12345"
            className={inputCls}
          />
        </Field>
      </Section>

      <Section title="Branding & grouping">
        <Field label="Logo URL">
          <input
            value={f.logo_url}
            onChange={(e) => set("logo_url", e.target.value)}
            placeholder="https://…/logo.svg"
            className={inputCls}
          />
        </Field>
        <Field label="Primary color">
          <input
            type="color"
            value={f.primary_color}
            onChange={(e) => set("primary_color", e.target.value)}
            className="h-9 w-16 rounded border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
          />
        </Field>
        <Field label="Tags" hint="comma-separated, e.g. SaaS, Team A">
          <input
            value={f.tags}
            onChange={(e) => set("tags", e.target.value)}
            placeholder="SaaS, Team A"
            className={inputCls}
          />
        </Field>
      </Section>

      <Section title="Invite (optional)">
        <Field label="Client email" hint="sends a magic-link invite as a 'client' member">
          <input
            type="email"
            value={f.inviteEmail}
            onChange={(e) => set("inviteEmail", e.target.value)}
            placeholder="owner@acme.com"
            className={inputCls}
          />
        </Field>
      </Section>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={phase === "creating"}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
        >
          {phase === "creating" ? "Creating…" : "Create client"}
        </button>
        <Link
          href="/admin"
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

const inputCls =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <legend className="px-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
        {title}
      </legend>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="text-zinc-600 dark:text-zinc-400">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-xs text-zinc-400">{hint}</span>}
    </label>
  );
}

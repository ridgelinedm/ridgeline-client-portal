"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUp, ArrowDown, Trash2, Plus, GripVertical } from "lucide-react";
import {
  WIDGET_META,
  ALL_WIDGET_TYPES,
  type Layout,
  type LayoutWidget,
  type WidgetType,
} from "@/lib/widgets/types";

function spanClass(w: 1 | 2 | 3): string {
  return w === 3 ? "col-span-3" : w === 2 ? "col-span-2" : "col-span-1";
}

export function LayoutEditor({
  workspaceId,
  slug,
  initialLayout,
}: {
  workspaceId: string;
  slug: string;
  initialLayout: Layout;
}) {
  const [widgets, setWidgets] = useState<LayoutWidget[]>(
    initialLayout.widgets,
  );
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const touch = () => setStatus("idle");

  function add(type: WidgetType) {
    setWidgets((w) => [
      ...w,
      { id: crypto.randomUUID(), type, w: WIDGET_META[type].defaultWidth },
    ]);
    touch();
  }
  function remove(id: string) {
    setWidgets((w) => w.filter((x) => x.id !== id));
    touch();
  }
  function move(id: string, dir: "up" | "down") {
    setWidgets((w) => {
      const i = w.findIndex((x) => x.id === id);
      const j = dir === "up" ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= w.length) return w;
      const copy = [...w];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
    touch();
  }
  function setWidth(id: string, width: 1 | 2 | 3) {
    setWidgets((w) => w.map((x) => (x.id === id ? { ...x, w: width } : x)));
    touch();
  }
  function moveItem(from: number, to: number) {
    setWidgets((w) => {
      if (from === to || from < 0 || to < 0 || from >= w.length || to >= w.length)
        return w;
      const copy = [...w];
      const [item] = copy.splice(from, 1);
      copy.splice(to, 0, item);
      return copy;
    });
    touch();
  }

  async function save() {
    setStatus("saving");
    setError(null);
    try {
      const res = await fetch("/api/admin/layout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspace_id: workspaceId,
          layout: { version: 1, widgets },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Save failed");
        setStatus("error");
        return;
      }
      setStatus("saved");
    } catch (e) {
      setError((e as Error).message);
      setStatus("error");
    }
  }

  return (
    <div className="mt-6 space-y-6">
      {/* Schematic preview */}
      <div>
        <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Preview
        </h2>
        <div className="mt-2 grid grid-cols-3 gap-2 rounded-xl border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
          {widgets.length === 0 ? (
            <p className="col-span-3 py-6 text-center text-sm text-zinc-400">
              Empty — add widgets below.
            </p>
          ) : (
            widgets.map((w) => (
              <div
                key={w.id}
                className={`${spanClass(w.w)} flex min-h-14 items-center justify-center rounded-lg bg-zinc-100 px-2 py-3 text-center text-xs font-medium text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300`}
              >
                {WIDGET_META[w.type].label}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Widget list */}
      <div>
        <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Widgets
        </h2>
        <ul className="mt-2 space-y-2">
          {widgets.map((w, i) => (
            <li
              key={w.id}
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => {
                e.preventDefault();
                if (overIndex !== i) setOverIndex(i);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null) moveItem(dragIndex, i);
                setDragIndex(null);
                setOverIndex(null);
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
              className={`flex flex-wrap items-center gap-3 rounded-lg border bg-white p-3 dark:bg-zinc-950 ${
                dragIndex === i
                  ? "border-zinc-400 opacity-50 dark:border-zinc-600"
                  : overIndex === i && dragIndex !== null
                    ? "border-indigo-400"
                    : "border-zinc-200 dark:border-zinc-800"
              }`}
            >
              <GripVertical
                className="h-4 w-4 shrink-0 cursor-grab text-zinc-400"
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">
                  {WIDGET_META[w.type].label}
                </div>
                <div className="truncate text-xs text-zinc-500">
                  {WIDGET_META[w.type].description}
                </div>
              </div>

              {/* width control */}
              <div className="flex rounded-md border border-zinc-200 p-0.5 dark:border-zinc-800">
                {([1, 2, 3] as const).map((width) => (
                  <button
                    key={width}
                    type="button"
                    onClick={() => setWidth(w.id, width)}
                    className={`rounded px-2 py-0.5 text-xs ${
                      w.w === width
                        ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                        : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                    }`}
                    title={`${width}-column wide`}
                  >
                    {width === 3 ? "Full" : width === 2 ? "2/3" : "1/3"}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1">
                <IconBtn
                  label="Move up"
                  disabled={i === 0}
                  onClick={() => move(w.id, "up")}
                >
                  <ArrowUp className="h-4 w-4" />
                </IconBtn>
                <IconBtn
                  label="Move down"
                  disabled={i === widgets.length - 1}
                  onClick={() => move(w.id, "down")}
                >
                  <ArrowDown className="h-4 w-4" />
                </IconBtn>
                <IconBtn label="Remove" onClick={() => remove(w.id)}>
                  <Trash2 className="h-4 w-4 text-red-500" />
                </IconBtn>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Palette */}
      <div>
        <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Add a widget
        </h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {ALL_WIDGET_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => add(type)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm hover:border-zinc-400 dark:border-zinc-800"
            >
              <Plus className="h-3.5 w-3.5" />
              {WIDGET_META[type].label}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <button
          type="button"
          onClick={save}
          disabled={status === "saving"}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
        >
          {status === "saving" ? "Saving…" : "Save layout"}
        </button>
        <Link
          href={`/${slug}`}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
        >
          View dashboard
        </Link>
        {status === "saved" && (
          <span className="text-sm text-emerald-600">Saved.</span>
        )}
        {status === "error" && (
          <span className="text-sm text-red-600">{error}</span>
        )}
      </div>
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800"
    >
      {children}
    </button>
  );
}

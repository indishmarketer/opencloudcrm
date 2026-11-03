"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Category, Space } from "@/lib/community";
import { useConfirm } from "@/components/ConfirmDialog";

export default function CategoryManager({ space, categories }: { space: Space; categories: Category[] }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [error, setError] = useState("");
  const { confirm, dialog } = useConfirm();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setError("");
    const form = e.currentTarget;
    const name = (form.elements.namedItem("name") as HTMLInputElement).value;
    const description = (form.elements.namedItem("description") as HTMLInputElement).value;

    try {
      const res = await fetch("/api/community/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ space, name, description }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Something went wrong.");
      form.reset();
      setStatus("idle");
      router.refresh();
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  async function handleDelete(id: number) {
    const ok = await confirm({
      message: "Delete this category? Posts in it will keep showing but lose their category tag.",
    });
    if (!ok) return;
    await fetch("/api/community/categories", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {categories.map((c) => (
          <div
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-4 py-2.5 text-sm"
          >
            <span>{c.name}</span>
            <button
              type="button"
              onClick={() => handleDelete(c.id)}
              className="text-xs text-red-600 underline hover:text-red-700"
            >
              Delete
            </button>
          </div>
        ))}
        {categories.length === 0 && <p className="text-sm text-ink-soft">No categories yet.</p>}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
        <input
          name="name"
          type="text"
          required
          placeholder="Category name"
          className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-4 py-2 text-sm outline-none focus:border-ink"
        />
        <input
          name="description"
          type="text"
          placeholder="Description (optional)"
          className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-4 py-2 text-sm outline-none focus:border-ink"
        />
        <button
          type="submit"
          disabled={status === "submitting"}
          className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          Add
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {dialog}
    </div>
  );
}

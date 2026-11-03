"use client";

import { useRouter } from "next/navigation";
import type { SpaceSettings } from "@/lib/community";

export default function SpaceSettingsPanel({ settings }: { settings: SpaceSettings[] }) {
  const router = useRouter();

  async function toggle(space: string, field: "auto_approve_posts" | "auto_approve_comments", value: boolean) {
    await fetch("/api/community/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ space, [field]: value }),
    });
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {settings.map((s) => (
        <div key={s.space} className="rounded-lg border border-line px-4 py-3 text-sm">
          <p className="font-medium capitalize">{s.space}</p>
          <label className="mt-2 flex items-center gap-2">
            <input
              type="checkbox"
              checked={s.auto_approve_posts}
              onChange={(e) => toggle(s.space, "auto_approve_posts", e.target.checked)}
            />
            Auto-approve posts
          </label>
          <label className="mt-1 flex items-center gap-2">
            <input
              type="checkbox"
              checked={s.auto_approve_comments}
              onChange={(e) => toggle(s.space, "auto_approve_comments", e.target.checked)}
            />
            Auto-approve comments
          </label>
        </div>
      ))}
    </div>
  );
}

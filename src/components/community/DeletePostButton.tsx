"use client";

import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ConfirmDialog";

export default function DeletePostButton({ postId, space }: { postId: number; space: string }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();

  async function handleDelete() {
    const ok = await confirm({ message: "Delete this post? This can't be undone." });
    if (!ok) return;
    const res = await fetch(`/api/community/posts/${postId}`, { method: "DELETE" });
    if (res.ok) {
      router.push(`/community/${space}`);
      router.refresh();
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleDelete}
        className="text-xs font-medium text-red-600 underline hover:text-red-700"
      >
        Delete post
      </button>
      {dialog}
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { trackEvent } from "@/lib/gtag";

type VideoResponse =
  | { type: "youtube"; videoId: string }
  | { type: "r2"; url: string }
  | { error: string };

export default function CourseLessonPlayer({
  courseSlug,
  lessonId,
  nextLessonHref,
  alreadyCompleted,
}: {
  courseSlug: string;
  lessonId: number;
  nextLessonHref: string | null;
  alreadyCompleted: boolean;
}) {
  const router = useRouter();
  const [video, setVideo] = useState<VideoResponse | null>(null);
  const [completed, setCompleted] = useState(alreadyCompleted);
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/account/courses/${courseSlug}/lessons/${lessonId}/video-url`)
      .then((r) => r.json())
      .then((v) => {
        if (!cancelled) setVideo(v);
      });
    return () => {
      cancelled = true;
    };
  }, [courseSlug, lessonId]);

  async function markComplete() {
    setMarking(true);
    const response = await fetch(`/api/account/courses/${courseSlug}/lessons/${lessonId}/complete`, { method: "POST" });
    setMarking(false);
    if (!response.ok) return;
    trackEvent("course_lesson_completed", { course: courseSlug, lesson_id: String(lessonId) });
    setCompleted(true);
    router.refresh();
  }

  return (
    <div>
      <div className="aspect-video w-full overflow-hidden rounded-2xl border border-line bg-paper-soft">
        {!video ? (
          <div className="flex h-full items-center justify-center text-sm text-ink-soft">Loading…</div>
        ) : "error" in video ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-ink-soft">
            {video.error}
          </div>
        ) : video.type === "youtube" ? (
          <iframe
            className="h-full w-full"
            src={`https://www.youtube.com/embed/${video.videoId}`}
            title="Lesson video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <video
            className="h-full w-full"
            src={video.url}
            controls
            controlsList="nodownload"
            onContextMenu={(e) => e.preventDefault()}
          />
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={markComplete}
          disabled={completed || marking}
          className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          {completed ? "Completed" : marking ? "Saving…" : "Mark as complete"}
        </button>
        {completed && nextLessonHref && (
          <a
            href={nextLessonHref}
            className="rounded-full border border-line px-6 py-3 text-sm font-medium transition-colors hover:border-ink"
          >
            Next lesson
          </a>
        )}
      </div>
    </div>
  );
}

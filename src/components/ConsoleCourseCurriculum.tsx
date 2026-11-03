"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ConsoleModal from "@/components/ConsoleModal";
import CourseVideoPicker from "@/components/CourseVideoPicker";
import BrandSelect from "@/components/BrandSelect";
import { useConfirm } from "@/components/ConfirmDialog";

type Module = {
  id: number;
  title: string;
  description: string | null;
  tier: "free" | "pro";
  position: number;
};

type Lesson = {
  id: number;
  module_id: number;
  title: string;
  description: string | null;
  video_type: "youtube" | "r2";
  video_ref: string | null;
  position: number;
};

type Resource = {
  id: number;
  lesson_id: number;
  label: string;
  url: string;
  position: number;
};

export default function ConsoleCourseCurriculum({
  courseId,
  initialModules,
  initialLessons,
  initialResources,
}: {
  courseId: number;
  courseTitle: string;
  initialModules: Module[];
  initialLessons: Lesson[];
  initialResources: Resource[];
}) {
  const router = useRouter();
  const [modules, setModules] = useState(initialModules);
  const [lessons, setLessons] = useState(initialLessons);
  const [resources, setResources] = useState(initialResources);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [editingModule, setEditingModule] = useState<Partial<Module> | null>(null);
  const [editingLesson, setEditingLesson] = useState<Partial<Lesson> | null>(null);
  const [editingResource, setEditingResource] = useState<Partial<Resource> | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(-1);
  const [videoPickerOpen, setVideoPickerOpen] = useState(false);
  const { confirm, dialog } = useConfirm();

  // --- Modules ---
  const handleSaveModule = async () => {
    if (!editingModule?.title) return setError("Title is required");
    setBusy(true);
    setError("");
    const isNew = !editingModule.id;
    const url = isNew 
      ? `/api/console/courses/${courseId}/modules`
      : `/api/console/courses/${courseId}/modules/${editingModule.id}`;
    
    const res = await fetch(url, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingModule),
    });

    if (!res.ok) {
      setError("Failed to save module");
      setBusy(false);
      return;
    }
    
    const saved = await res.json();
    if (isNew) {
      setModules([...modules, saved.module].sort((a, b) => a.position - b.position));
    } else {
      setModules(modules.map(m => m.id === saved.module.id ? saved.module : m).sort((a, b) => a.position - b.position));
    }
    setEditingModule(null);
    setBusy(false);
    router.refresh();
  };

  const handleMoveModule = async (moduleId: number, dir: 1 | -1) => {
    const idx = modules.findIndex(m => m.id === moduleId);
    if (idx < 0) return;
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= modules.length) return;
    
    const newModules = [...modules];
    const tempPos = newModules[idx].position;
    newModules[idx].position = newModules[targetIdx].position;
    newModules[targetIdx].position = tempPos;
    
    setModules(newModules.sort((a, b) => a.position - b.position));
    
    await fetch(`/api/console/courses/${courseId}/modules/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates: newModules.map(m => ({ id: m.id, position: m.position })) }),
    });
  };

  const handleDeleteModule = async (moduleId: number) => {
    if (!(await confirm({ message: "Delete this module and every lesson and resource inside it? This cannot be undone." }))) return;
    setBusy(true);
    setError("");
    const res = await fetch(`/api/console/courses/${courseId}/modules/${moduleId}`, { method: "DELETE" });
    const response = await res.json().catch(() => ({}));
    if (res.ok) {
      setModules(modules.filter(m => m.id !== moduleId));
      setLessons(lessons.filter(l => l.module_id !== moduleId));
      setResources(resources.filter((resource) => lessons.some((lesson) => lesson.id === resource.lesson_id && lesson.module_id !== moduleId)));
    } else {
      setError(response.error || "Failed to delete module.");
    }
    setBusy(false);
  };

  // --- Lessons ---
  const handleSaveLesson = async () => {
    if (!editingLesson?.title) return setError("Title is required");
    if (!editingLesson?.module_id) return setError("Module is required");
    setBusy(true);
    setError("");

    // If there's a video file, upload it to R2 first
    let finalVideoRef = editingLesson.video_ref;
    if (videoFile && editingLesson.video_type === "r2") {
      try {
        if (videoFile.size > 2 * 1024 * 1024 * 1024) throw new Error("Video must be no more than 2GB.");
        setUploadProgress(0);
        const uploadConfigResponse = await fetch(
          `/api/console/courses/upload-url?courseId=${courseId}&filename=${encodeURIComponent(videoFile.name)}&contentType=${encodeURIComponent(videoFile.type)}&size=${videoFile.size}`,
        );
        const uploadConfig = await uploadConfigResponse.json().catch(() => ({}));
        if (!uploadConfigResponse.ok || !uploadConfig.uploadUrl || !uploadConfig.key) {
          throw new Error(uploadConfig.error || "Could not prepare the video upload.");
        }
        const { key, uploadUrl } = uploadConfig;
        
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', uploadUrl, true);
          xhr.setRequestHeader('Content-Type', videoFile.type);
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              setUploadProgress(Math.round((e.loaded / e.total) * 100));
            }
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error("Upload failed"));
          };
          xhr.onerror = () => reject(new Error("Upload failed"));
          xhr.send(videoFile);
        });
        
        finalVideoRef = key;
        setUploadProgress(-1);
      } catch (err) {
        setError((err as Error).message || "Failed to upload video");
        setBusy(false);
        setUploadProgress(-1);
        return;
      }
    }

    const payload = { ...editingLesson, video_ref: finalVideoRef };
    
    const isNew = !editingLesson.id;
    const url = isNew 
      ? `/api/console/courses/${courseId}/lessons`
      : `/api/console/courses/${courseId}/lessons/${editingLesson.id}`;
    
    const res = await fetch(url, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const response = await res.json().catch(() => ({}));
      setError(response.error || "Failed to save lesson");
      setBusy(false);
      return;
    }
    
    const saved = await res.json();
    if (isNew) {
      setLessons([...lessons, saved.lesson].sort((a, b) => a.position - b.position));
    } else {
      setLessons(lessons.map(l => l.id === saved.lesson.id ? saved.lesson : l).sort((a, b) => a.position - b.position));
    }
    setEditingLesson(null);
    setVideoFile(null);
    setBusy(false);
    router.refresh();
  };

  const handleMoveLesson = async (lessonId: number, dir: 1 | -1, moduleId: number) => {
    const modLessons = lessons.filter(l => l.module_id === moduleId).sort((a, b) => a.position - b.position);
    const idx = modLessons.findIndex(l => l.id === lessonId);
    if (idx < 0) return;
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= modLessons.length) return;
    
    const tempPos = modLessons[idx].position;
    modLessons[idx].position = modLessons[targetIdx].position;
    modLessons[targetIdx].position = tempPos;
    
    const updatedLessons = lessons.map(l => {
      const updated = modLessons.find(ml => ml.id === l.id);
      return updated ? updated : l;
    });
    setLessons(updatedLessons.sort((a, b) => a.position - b.position));
    
    await fetch(`/api/console/courses/${courseId}/lessons/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates: modLessons.map(l => ({ id: l.id, position: l.position })) }),
    });
  };

  const handleDeleteLesson = async (lessonId: number) => {
    if (!(await confirm({ message: "Delete this lesson, its progress records, comments, resources, and private uploaded video? This cannot be undone." }))) return;
    setBusy(true);
    setError("");
    const res = await fetch(`/api/console/courses/${courseId}/lessons/${lessonId}`, { method: "DELETE" });
    const response = await res.json().catch(() => ({}));
    if (res.ok) {
      setLessons(lessons.filter(l => l.id !== lessonId));
      setResources(resources.filter((resource) => resource.lesson_id !== lessonId));
    } else {
      setError(response.error || "Failed to delete lesson.");
    }
    setBusy(false);
  };

  // --- Resources ---
  const handleSaveResource = async () => {
    if (!editingResource?.label || !editingResource?.url) return setError("Label and URL are required");
    setBusy(true);
    setError("");

    const isNew = !editingResource.id;
    const url = isNew 
      ? `/api/console/courses/${courseId}/resources`
      : `/api/console/courses/${courseId}/resources/${editingResource.id}`;
    
    const res = await fetch(url, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingResource),
    });

    if (!res.ok) {
      setError("Failed to save resource");
      setBusy(false);
      return;
    }
    
    const saved = await res.json();
    if (isNew) {
      setResources([...resources, saved.resource]);
    } else {
      setResources(resources.map(r => r.id === saved.resource.id ? saved.resource : r));
    }
    setEditingResource(null);
    setBusy(false);
  };

  const handleDeleteResource = async (resourceId: number) => {
    if (!(await confirm({ message: "Delete this lesson resource? This cannot be undone." }))) return;
    setBusy(true);
    setError("");
    const res = await fetch(`/api/console/courses/${courseId}/resources/${resourceId}`, { method: "DELETE" });
    const response = await res.json().catch(() => ({}));
    if (res.ok) setResources(resources.filter(r => r.id !== resourceId));
    else setError(response.error || "Failed to delete resource.");
    setBusy(false);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="font-semibold text-xl">Curriculum Builder</h2>
        <button
          onClick={() => setEditingModule({ tier: "pro", position: modules.length > 0 ? Math.max(...modules.map(m => m.position)) + 1 : 1 })}
          className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-opacity hover:opacity-80"
        >
          Add Module
        </button>
      </div>

      <div className="space-y-6">
        {modules.map((m, mIdx) => (
          <div key={m.id} className="bg-paper border border-line rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-line">
              <div>
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  Module {mIdx + 1}: {m.title}
                  <span className={`text-xs px-2 py-0.5 rounded-full ${m.tier === 'free' ? 'bg-gray-100 text-gray-800' : 'bg-red-100 text-red-800 border border-red-200'}`}>
                    {m.tier.toUpperCase()}
                  </span>
                </h3>
                {m.description && <p className="text-sm text-ink-soft mt-1">{m.description}</p>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => handleMoveModule(m.id, -1)} disabled={mIdx === 0} className="p-1 hover:bg-paper-soft rounded disabled:opacity-30">↑</button>
                <button onClick={() => handleMoveModule(m.id, 1)} disabled={mIdx === modules.length - 1} className="p-1 hover:bg-paper-soft rounded disabled:opacity-30">↓</button>
                <button onClick={() => setEditingModule(m)} className="text-sm px-3 py-1 border border-line rounded-full hover:border-ink ml-2">Edit</button>
                <button onClick={() => handleDeleteModule(m.id)} className="text-sm px-3 py-1 border border-red-200 text-red-600 rounded-full hover:border-red-600">Delete</button>
              </div>
            </div>

            <div className="space-y-3 pl-4 border-l-2 border-line">
              {lessons.filter(l => l.module_id === m.id).map((l, lIdx, arr) => (
                <div key={l.id} className="p-3 bg-paper-soft rounded-xl border border-line">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-sm">
                        Lesson {mIdx + 1}.{lIdx + 1}: {l.title}
                      </p>
                      <p className="text-xs text-ink-soft flex items-center gap-2 mt-1">
                        <span className="bg-white px-2 py-0.5 rounded border border-line">{l.video_type === "youtube" ? "YouTube" : "Uploaded video"}</span>
                        {l.video_ref ? (
                          <span className="text-green-600 truncate max-w-[200px]" title={l.video_ref}>Video attached ({l.video_ref})</span>
                        ) : (
                          <span className="text-red-500">Missing video</span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleMoveLesson(l.id, -1, m.id)} disabled={lIdx === 0} className="p-1 hover:bg-white rounded disabled:opacity-30">↑</button>
                      <button onClick={() => handleMoveLesson(l.id, 1, m.id)} disabled={lIdx === arr.length - 1} className="p-1 hover:bg-white rounded disabled:opacity-30">↓</button>
                      <button onClick={() => setEditingLesson(l)} className="text-xs px-2 py-1 ml-2 underline text-ink-soft hover:text-ink">Edit</button>
                      <button onClick={() => handleDeleteLesson(l.id)} className="text-xs px-2 py-1 underline text-red-400 hover:text-red-600">Del</button>
                    </div>
                  </div>
                  
                  {/* Resources for this lesson */}
                  {resources.filter(r => r.lesson_id === l.id).length > 0 && (
                    <div className="mt-2 pt-2 border-t border-line/50 flex flex-wrap gap-2">
                      {resources.filter(r => r.lesson_id === l.id).map(r => (
                        <div key={r.id} className="text-xs flex items-center gap-1 bg-white px-2 py-1 rounded border border-line">
                          <span className="truncate max-w-[120px]">{r.label}</span>
                          <button onClick={() => setEditingResource(r)} className="ml-1 text-ink-soft hover:text-ink">✎</button>
                          <button onClick={() => handleDeleteResource(r.id)} className="text-red-400 hover:text-red-600">×</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => setEditingResource({ lesson_id: l.id, position: resources.filter(r => r.lesson_id === l.id).length + 1 })}
                    className="text-xs text-ink-soft hover:text-ink mt-2 block underline"
                  >
                    + Add resource
                  </button>
                </div>
              ))}
              <button
                onClick={() => setEditingLesson({ module_id: m.id, video_type: "youtube", position: lessons.filter(l => l.module_id === m.id).length + 1 })}
                className="text-sm font-medium text-ink-soft hover:text-ink flex items-center gap-1 p-2"
              >
                + Add Lesson
              </button>
            </div>
          </div>
        ))}
        {modules.length === 0 && (
          <div className="p-8 text-center text-ink-soft border border-dashed border-line rounded-2xl">
            No modules yet. Add one to get started.
          </div>
        )}
      </div>

      {/* Module Modal */}
      {editingModule && (
        <ConsoleModal title={editingModule.id ? "Edit Module" : "New Module"} onClose={() => setEditingModule(null)}>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-ink-soft">Title</label>
              <input
                value={editingModule.title || ""}
                onChange={(e) => setEditingModule({ ...editingModule, title: e.target.value })}
                className="mt-1 w-full rounded-lg border border-line bg-paper px-4 py-2.5 text-sm outline-none focus:border-ink"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-soft">Description (optional)</label>
              <textarea
                value={editingModule.description || ""}
                onChange={(e) => setEditingModule({ ...editingModule, description: e.target.value })}
                rows={3}
                className="mt-1 w-full rounded-lg border border-line bg-paper px-4 py-2.5 text-sm outline-none focus:border-ink"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-soft">Tier</label>
              <div className="mt-1 flex gap-2">
                <button
                  onClick={() => setEditingModule({ ...editingModule, tier: "free" })}
                  className={`px-4 py-2 text-sm rounded-full border ${editingModule.tier === 'free' ? 'bg-ink text-paper border-ink' : 'border-line'}`}
                >
                  Free (Preview)
                </button>
                <button
                  onClick={() => setEditingModule({ ...editingModule, tier: "pro" })}
                  className={`px-4 py-2 text-sm rounded-full border ${editingModule.tier === 'pro' ? 'bg-ink text-paper border-ink' : 'border-line'}`}
                >
                  PRO (Paid)
                </button>
              </div>
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button onClick={() => setEditingModule(null)} className="rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-ink">Cancel</button>
            <button onClick={handleSaveModule} disabled={busy} className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper hover:opacity-80 disabled:opacity-50">Save</button>
          </div>
        </ConsoleModal>
      )}

      {/* Lesson Modal */}
      {editingLesson && (
        <ConsoleModal title={editingLesson.id ? "Edit Lesson" : "New Lesson"} onClose={() => { setEditingLesson(null); setVideoFile(null); }}>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
            <div>
              <label className="text-xs font-medium text-ink-soft">Title</label>
              <input
                value={editingLesson.title || ""}
                onChange={(e) => setEditingLesson({ ...editingLesson, title: e.target.value })}
                className="mt-1 w-full rounded-lg border border-line bg-paper px-4 py-2.5 text-sm outline-none focus:border-ink"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-soft">Written Content / Description (HTML allowed)</label>
              <textarea
                value={editingLesson.description || ""}
                onChange={(e) => setEditingLesson({ ...editingLesson, description: e.target.value })}
                rows={5}
                className="mt-1 w-full rounded-lg border border-line bg-paper px-4 py-2.5 text-sm outline-none focus:border-ink font-mono text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-soft">Video Type</label>
              <div className="mt-1">
                <BrandSelect
                  value={editingLesson.video_type || "youtube"}
                  onChange={(v) => setEditingLesson({ ...editingLesson, video_type: v as "youtube" | "r2", video_ref: "" })}
                  options={[
                    { value: "youtube", label: "YouTube (Public ID)" },
                    { value: "r2", label: "Upload video" },
                  ]}
                />
              </div>
            </div>
            
            {editingLesson.video_type === "youtube" && (
              <div>
                <label className="text-xs font-medium text-ink-soft">YouTube Video ID</label>
                <input
                  value={editingLesson.video_ref || ""}
                  onChange={(e) => setEditingLesson({ ...editingLesson, video_ref: e.target.value })}
                  placeholder="e.g. dQw4w9WgXcQ"
                  className="mt-1 w-full rounded-lg border border-line bg-paper px-4 py-2.5 text-sm outline-none focus:border-ink"
                />
              </div>
            )}

            {editingLesson.video_type === "r2" && (
              <div className="bg-paper-soft p-4 rounded-xl border border-line">
                <label className="text-xs font-medium text-ink-soft block mb-2">Upload video</label>
                {editingLesson.video_ref && (
                  <p className="text-xs mb-2">Current video: <span className="font-medium text-ink-soft">{editingLesson.video_ref.split("/").pop()}</span></p>
                )}
                <input
                  type="file"
                  accept="video/mp4,video/webm,video/ogg,video/quicktime"
                  onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
                  className="text-sm w-full file:mr-4 file:cursor-pointer file:rounded-full file:border-0 file:bg-ink file:px-4 file:py-2 file:font-semibold file:text-paper hover:file:opacity-80"
                />
                <button
                  type="button"
                  onClick={() => setVideoPickerOpen(true)}
                  className="mt-3 rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-ink"
                >
                  Browse media library
                </button>
                {editingLesson.video_ref && !videoFile && (
                  <p className="mt-2 truncate text-xs text-ink-soft">Selected: {editingLesson.video_ref.split("/").pop()}</p>
                )}
                {uploadProgress >= 0 && (
                  <div className="mt-3">
                    <div className="h-1.5 w-full bg-line rounded-full overflow-hidden">
                      <div className="h-full bg-ink transition-all" style={{ width: `${uploadProgress}%` }}></div>
                    </div>
                    <p className="text-xs text-right mt-1 text-ink-soft">Uploading: {uploadProgress}%</p>
                  </div>
                )}
              </div>
            )}

            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
          <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-line">
            <button onClick={() => { setEditingLesson(null); setVideoFile(null); }} className="rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-ink">Cancel</button>
            <button onClick={handleSaveLesson} disabled={busy} className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper hover:opacity-80 disabled:opacity-50">Save</button>
          </div>
        </ConsoleModal>
      )}

      {/* Resource Modal */}
      {editingResource && (
        <ConsoleModal title={editingResource.id ? "Edit Resource" : "New Resource"} onClose={() => setEditingResource(null)}>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-ink-soft">Label</label>
              <input
                value={editingResource.label || ""}
                onChange={(e) => setEditingResource({ ...editingResource, label: e.target.value })}
                placeholder="e.g. Download Slides (PDF)"
                className="mt-1 w-full rounded-lg border border-line bg-paper px-4 py-2.5 text-sm outline-none focus:border-ink"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-soft">URL</label>
              <input
                value={editingResource.url || ""}
                onChange={(e) => setEditingResource({ ...editingResource, url: e.target.value })}
                placeholder="https://..."
                className="mt-1 w-full rounded-lg border border-line bg-paper px-4 py-2.5 text-sm outline-none focus:border-ink"
              />
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button onClick={() => setEditingResource(null)} className="rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-ink">Cancel</button>
            <button onClick={handleSaveResource} disabled={busy} className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper hover:opacity-80 disabled:opacity-50">Save</button>
          </div>
        </ConsoleModal>
      )}
      {dialog}
      {videoPickerOpen && editingLesson && (
        <CourseVideoPicker
          onClose={() => setVideoPickerOpen(false)}
          onSelect={(key) => {
            setEditingLesson((current) => current ? { ...current, video_type: "r2", video_ref: key } : current);
            setVideoFile(null);
            setVideoPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}

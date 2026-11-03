"use client";

import { useState } from "react";
import { NodeViewWrapper, type NodeViewProps, type Editor } from "@tiptap/react";
import BrandSelect from "@/components/BrandSelect";
import { useGuideEditorContext, type GuideStepAttrs } from "@/components/guideEditorContext";

// Swaps this step with the block immediately before/after it in the
// document -- reordering happens right here on the card instead of a
// separate up/down control bound to a list somewhere else on the page.
function swapWithSibling(editor: Editor, getPos: () => number | undefined, dir: -1 | 1) {
  const pos = getPos();
  if (pos === undefined) return;
  const { state, view } = editor;
  const { doc } = state;
  const index = doc.resolve(pos).index(0);
  const targetIndex = index + dir;
  if (targetIndex < 0 || targetIndex >= doc.childCount) return;

  const offsets: number[] = [];
  let running = 0;
  doc.forEach((node) => {
    offsets.push(running);
    running += node.nodeSize;
  });

  const i1 = Math.min(index, targetIndex);
  const i2 = Math.max(index, targetIndex);
  const node1 = doc.child(i1);
  const node2 = doc.child(i2);
  const start1 = offsets[i1];
  const end1 = start1 + node1.nodeSize;
  const start2 = offsets[i2];
  const end2 = start2 + node2.nodeSize;

  const tr = state.tr;
  tr.replaceWith(start2, end2, node1);
  tr.replaceWith(start1, end1, node2);
  view.dispatch(tr);
}

export default function GuideStepNodeView({ node, updateAttributes, deleteNode, getPos, editor }: NodeViewProps) {
  const { prompts, skills, categories, onCreateItem, onToggleLibrary } = useGuideEditorContext();
  const attrs = node.attrs as GuideStepAttrs;
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [newTitle, setNewTitle] = useState("");
  const [newCategoryId, setNewCategoryId] = useState("");
  const [newText, setNewText] = useState("");
  const [newShowInLibrary, setNewShowInLibrary] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const list = attrs.itemType === "prompt" ? prompts : skills;
  const attached = attrs.refId ? list.find((i) => i.id === attrs.refId) : undefined;
  const itemOptions = list.map((i) => ({ value: String(i.id), label: `${i.title} (${i.category_name})` }));
  const categoryOptions = categories.map((c) => ({ value: String(c.id), label: c.name }));

  function setItemType(itemType: "prompt" | "skill") {
    updateAttributes({ itemType, refId: null });
  }

  async function handleCreate() {
    if (!newTitle.trim() || !newCategoryId || !newText.trim()) {
      setCreateError("Title, category, and text are all required.");
      return;
    }
    setCreating(true);
    setCreateError("");
    const result = await onCreateItem(attrs.itemType, {
      title: newTitle,
      category_id: Number(newCategoryId),
      text: newText,
      show_in_library: newShowInLibrary,
    });
    setCreating(false);
    if ("error" in result) {
      setCreateError(result.error);
      return;
    }
    updateAttributes({ refId: result.id });
    setMode("existing");
    setNewTitle("");
    setNewCategoryId("");
    setNewText("");
    setNewShowInLibrary(false);
  }

  return (
    <NodeViewWrapper className="not-prose my-3 overflow-hidden rounded-xl border border-line border-l-4 border-l-ink bg-paper">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-paper-soft px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Step</span>
        <div className="flex overflow-hidden rounded-full border border-line text-xs">
          <button
            type="button"
            onClick={() => setItemType("prompt")}
            className={`px-3 py-1 font-medium ${attrs.itemType === "prompt" ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper-soft"}`}
          >
            Prompt
          </button>
          <button
            type="button"
            onClick={() => setItemType("skill")}
            className={`px-3 py-1 font-medium ${attrs.itemType === "skill" ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper-soft"}`}
          >
            Skill
          </button>
        </div>
        <input
          placeholder="Timestamp (e.g. 2:15)"
          value={attrs.timestampLabel}
          onChange={(e) => updateAttributes({ timestampLabel: e.target.value })}
          className="w-32 rounded-lg border border-line bg-paper px-2.5 py-1 text-xs outline-none focus:border-ink"
        />
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => swapWithSibling(editor, getPos, -1)} className="text-xs text-ink-soft hover:text-ink" aria-label="Move up">
            &uarr;
          </button>
          <button type="button" onClick={() => swapWithSibling(editor, getPos, 1)} className="text-xs text-ink-soft hover:text-ink" aria-label="Move down">
            &darr;
          </button>
          <button type="button" onClick={() => deleteNode()} className="text-xs font-medium text-red-600 hover:underline">
            Remove
          </button>
        </div>
      </div>

      <div className="p-3">
        {attrs.refId && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-line bg-paper-soft px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{attached?.title || "(deleted item)"}</p>
              {attached && <p className="truncate text-xs text-ink-soft">{attached.category_name}</p>}
            </div>
            {attached && (
              <button
                type="button"
                onClick={() => onToggleLibrary(attrs.itemType, attached.id)}
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${attached.show_in_library ? "bg-blue-100 text-blue-700" : "bg-paper text-ink-soft"}`}
              >
                {attached.show_in_library ? "In library" : "Guide-only"}
              </button>
            )}
          </div>
        )}

        <div className="flex overflow-hidden rounded-full border border-line text-xs" contentEditable={false}>
          <button
            type="button"
            onClick={() => setMode("existing")}
            className={`px-3 py-1.5 font-medium ${mode === "existing" ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper-soft"}`}
          >
            {attrs.refId ? "Change" : "Existing"}
          </button>
          <button
            type="button"
            onClick={() => setMode("new")}
            className={`px-3 py-1.5 font-medium ${mode === "new" ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper-soft"}`}
          >
            New
          </button>
        </div>

        {mode === "existing" ? (
          <div className="mt-2">
            <BrandSelect
              compact
              value={attrs.refId ? String(attrs.refId) : ""}
              onChange={(v) => updateAttributes({ refId: Number(v) })}
              options={itemOptions}
              placeholder={attrs.itemType === "prompt" ? "Choose a prompt" : "Choose a skill"}
            />
          </div>
        ) : (
          <div className="mt-2 space-y-2 rounded-lg border border-dashed border-line p-3">
            {categories.length === 0 && <p className="text-xs text-amber-700">Add at least one category first, on the Categories tab.</p>}
            <input
              placeholder={`New ${attrs.itemType} title`}
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
            />
            <BrandSelect compact value={newCategoryId} onChange={setNewCategoryId} options={categoryOptions} placeholder="Category" />
            <textarea
              placeholder={attrs.itemType === "prompt" ? "The actual prompt text" : "The skill's markdown content"}
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
            />
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={newShowInLibrary} onChange={(e) => setNewShowInLibrary(e.target.checked)} className="h-4 w-4 rounded border-line" />
              Also show in the public Prompt &amp; Skill Library grid
            </label>
            {createError && <p className="text-xs text-red-600">{createError}</p>}
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              {creating ? "Creating..." : `Create ${attrs.itemType} & attach`}
            </button>
          </div>
        )}

        <textarea
          placeholder="Instruction shown at this step (e.g. After this point in the video, copy the prompt below and paste it into your tool)"
          value={attrs.instruction}
          onChange={(e) => updateAttributes({ instruction: e.target.value })}
          rows={2}
          className="mt-2 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
        />
      </div>
    </NodeViewWrapper>
  );
}

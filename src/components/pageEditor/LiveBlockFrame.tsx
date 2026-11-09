"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BLOCK_DEFS, getBlockDef, type PageBlock } from "@/lib/pageBlocks";
import type { PageEditorLiveData } from "@/lib/pageEditorLiveData";
import CustomBlock, { type CustomBlockEditing } from "@/components/pageBlocks/CustomBlock";
import {
  BusinessDetailsBlock,
  ButtonBlock,
  CardsBlock,
  ContactDetailsBlock,
  ContactFormSection,
  CountdownBlock,
  CtaBlock,
  CustomCodeBlock,
  FaqBlock,
  FeaturedOnBlock,
  FormBlock,
  HeadingBlock,
  HeroView,
  IconBlock,
  ImageBlock,
  IntegrationsBlock,
  LatestCoursesView,
  LatestPostsView,
  NestedElement,
  NewsletterBlock,
  PageHeaderBlock,
  ReviewsView,
  RichTextBlock,
  RowBlock,
  SocialIconsBlock,
  SpacerBlock,
  SplitBlock,
  StatsBlock,
  VideoBlock,
  WorkflowDemoBlock,
  type InlineEdit,
  type Props,
} from "@/components/pageBlocks/blockViews";
import BlockTypePicker from "@/components/pageEditor/BlockTypePicker";

const NESTABLE_DEFS = BLOCK_DEFS.filter((d) => d.nestable && !d.deprecated);

// Interactive descendants (real links, buttons, form fields, video
// iframes) would otherwise behave like the live site while editing --
// clicking one should select the section, not navigate/submit/play.
// Disabling their pointer events lets the click fall through to the
// wrapper's own onClick, instead of re-implementing every block's markup
// behind a transparent overlay just to catch clicks.
const INERT =
  "[&_a]:pointer-events-none [&_button]:pointer-events-none [&_input]:pointer-events-none [&_textarea]:pointer-events-none [&_select]:pointer-events-none [&_iframe]:pointer-events-none [&_form]:pointer-events-none";

type RenderColumn = (column: PageBlock[], columnIndex: number) => React.ReactNode;

/** The real visual output of one block -- mirrors the switch in
 * PageBlocks.tsx (the public renderer), but fed pre-fetched liveData
 * instead of awaiting its own DB calls, so it can run as a plain client
 * component inside the editor's canvas. */
export function renderLiveBlock(
  block: PageBlock,
  liveData: PageEditorLiveData,
  renderColumn?: RenderColumn,
  /** Only for a "custom" block, and only from the canvas: makes clicking
   * an element inside it select that element in Elements mode. */
  editing?: CustomBlockEditing,
  /** Only for the block currently selected, and only for a type that has
   * one unambiguous text field worth editing in place -- see InlineEdit's
   * own doc comment in blockViews.tsx. */
  inlineEdit?: InlineEdit
): React.ReactNode {
  const props = block.props as Props;
  const business = liveData.business;
  switch (block.type) {
    case "hero":
      return <HeroView props={props} activeLeadMagnet={liveData.activeLeadMagnet} />;
    case "pageHeader":
      return <PageHeaderBlock props={props} />;
    case "richText":
      return <RichTextBlock props={props} />;
    case "heading":
      return <HeadingBlock props={props} editableText={inlineEdit} />;
    case "button":
      return <ButtonBlock props={props} editableText={inlineEdit} />;
    case "icon":
      return <IconBlock props={props} editableText={inlineEdit} />;
    case "row":
      return <RowBlock props={props} renderColumn={renderColumn} />;
    case "cards":
      return <CardsBlock props={props} />;
    case "split":
      return <SplitBlock props={props} />;
    case "image":
      return <ImageBlock props={props} editableText={inlineEdit} />;
    case "video":
      return <VideoBlock props={props} editableText={inlineEdit} />;
    case "cta":
      return <CtaBlock props={props} />;
    case "custom":
      return <CustomBlock props={props} blockId={block.id} editing={editing} />;
    case "customCode":
      return <CustomCodeBlock props={props} />;
    case "countdown":
      return <CountdownBlock props={props} />;
    case "socialIcons":
      return <SocialIconsBlock props={props} />;
    case "faq":
      return <FaqBlock props={props} />;
    case "stats":
      return <StatsBlock props={props} />;
    case "latestPosts":
      return <LatestPostsView props={props} posts={liveData.posts} />;
    case "latestCourses":
      return <LatestCoursesView props={props} courses={liveData.courses} />;
    case "reviews":
      return <ReviewsView props={props} reviewers={liveData.reviewers} />;
    case "workflowDemo":
      return <WorkflowDemoBlock props={props} />;
    case "integrations":
      return <IntegrationsBlock props={props} />;
    case "featuredOn":
      return <FeaturedOnBlock props={props} />;
    case "contactForm":
      return <ContactFormSection props={props} business={business} />;
    case "newsletter":
      return <NewsletterBlock props={props} />;
    case "form":
      return <FormBlock props={props} business={business} />;
    case "contactDetails":
      return <ContactDetailsBlock props={props} business={business} />;
    case "businessDetails":
      return <BusinessDetailsBlock props={props} business={business} />;
    case "spacer":
      return <SpacerBlock props={props} />;
    case "builtIn":
      return (
        <div className="border-y border-dashed border-line bg-paper-soft px-6 py-10 text-center text-sm text-ink-soft">
          This page&apos;s own built-in content (its list, form or policy text) renders here on the live site. Check Preview to see it.
        </div>
      );
    default:
      return null;
  }
}

const GripIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
    <circle cx="9" cy="6" r="1.3" /><circle cx="15" cy="6" r="1.3" />
    <circle cx="9" cy="12" r="1.3" /><circle cx="15" cy="12" r="1.3" />
    <circle cx="9" cy="18" r="1.3" /><circle cx="15" cy="18" r="1.3" />
  </svg>
);
const DuplicateIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
  </svg>
);
const DeleteIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
  </svg>
);

const toolbarButton = "rounded-md p-1 text-ink-soft hover:bg-paper-soft hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-soft";

/** The one selection/outline/floating-toolbar wrapper used at every depth
 * of the block tree -- a top-level section and an element nested inside a
 * row's column both go through this, just with a different `depth` (which
 * only controls toolbar sizing/offset and which Tailwind hover-group name
 * applies, since group names must be literal classes Tailwind can see in
 * source -- not something that can vary per recursion depth at runtime)
 * and different `actions` passed in by the caller. `TopBlockFrame` and
 * `NestedElementFrame` below are now thin callers of this, kept as named
 * exports since their surrounding concerns (drag-to-reorder + the public
 * block renderer vs. the block-type-picker for adding elements) genuinely
 * differ -- only the selection chrome itself was duplicated before. */
export function SelectableNode({
  depth,
  selected,
  onSelect,
  label,
  inert = true,
  dragProps,
  isDragging,
  actions,
  children,
}: {
  depth: "top" | "nested";
  selected: boolean;
  onSelect: () => void;
  label: string;
  inert?: boolean;
  dragProps?: { ref: (el: HTMLElement | null) => void; style: React.CSSProperties };
  isDragging?: boolean;
  actions: React.ReactNode;
  children: React.ReactNode;
}) {
  const isTop = depth === "top";
  return (
    <div
      ref={dragProps?.ref}
      style={dragProps?.style}
      onClick={(e) => {
        if (!isTop) e.stopPropagation();
        onSelect();
      }}
      className={`${isTop ? "group" : "group/el"} relative cursor-pointer outline -outline-offset-2 transition-[outline-color] ${
        selected ? "outline-2 outline-ink" : "outline-2 outline-transparent hover:outline-ink/30"
      } ${isDragging ? "z-10 opacity-60" : ""}`}
    >
      {/* A custom section in Elements mode keeps its links live rather
          than inert: the whole point there is to click the exact element
          you mean, and INERT would make a click on a link or button land
          on whatever ancestor still had pointer events. CustomBlock's own
          handler stops the navigation instead. */}
      <div className={inert ? INERT : ""}>{children}</div>
      <div
        className={`absolute z-20 flex items-center gap-0.5 rounded-lg border border-line bg-white shadow-md transition-opacity ${
          isTop ? "-top-3 right-2 px-1 py-1" : "-top-2.5 right-1 rounded-md px-0.5 py-0.5"
        } ${
          selected
            ? "opacity-100"
            : isTop
              ? "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100"
              : "pointer-events-none opacity-0 group-hover/el:pointer-events-auto group-hover/el:opacity-100"
        }`}
      >
        <span className={`${isTop ? "px-1.5 text-[10px]" : "px-1 text-[9px]"} font-medium uppercase tracking-wide text-ink-soft`}>{label}</span>
        {actions}
      </div>
    </div>
  );
}

function stop<T>(fn: () => T) {
  return (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };
}

/** The real rendered section, with a selection outline, a floating
 * drag/duplicate/delete toolbar, and drag-to-reorder -- the public site's
 * actual markup is what's on screen; this only adds the editing chrome
 * around it. */
export function TopBlockFrame({
  block,
  liveData,
  selected,
  onSelect,
  onDuplicate,
  onDelete,
  renderColumn,
  interactive = true,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  editing,
  inlineEdit,
}: {
  block: PageBlock;
  liveData: PageEditorLiveData;
  selected: boolean;
  onSelect: () => void;
  onDuplicate?: () => void;
  onDelete: () => void;
  renderColumn?: RenderColumn;
  /** Passed for the selected "custom" block while Elements mode is open. */
  editing?: CustomBlockEditing;
  /** Passed for the selected block when its type has one text field worth
   * editing in place -- see InlineEdit's doc comment in blockViews.tsx. */
  inlineEdit?: InlineEdit;
  /** False inside MobileCanvasPortal: dragging can't work there (see its
   * own note), so move-up/down buttons take the drag handle's place. */
  interactive?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}) {
  const def = getBlockDef(block.type);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  return (
    <SelectableNode
      depth="top"
      selected={selected}
      onSelect={onSelect}
      label={def?.label || block.type}
      inert={!editing && !inlineEdit}
      dragProps={{ ref: setNodeRef, style: { transform: CSS.Transform.toString(transform), transition } }}
      isDragging={isDragging}
      actions={
        <>
          {interactive ? (
            <button
              type="button"
              {...attributes}
              {...listeners}
              onClick={(e) => e.stopPropagation()}
              aria-label="Drag to reorder"
              title="Drag to reorder"
              className={`${toolbarButton} cursor-grab touch-none active:cursor-grabbing`}
            >
              <GripIcon />
            </button>
          ) : (
            <>
              <button type="button" disabled={!canMoveUp} onClick={stop(() => onMoveUp?.())} aria-label="Move up" className={toolbarButton}>
                ▲
              </button>
              <button type="button" disabled={!canMoveDown} onClick={stop(() => onMoveDown?.())} aria-label="Move down" className={toolbarButton}>
                ▼
              </button>
            </>
          )}
          {onDuplicate && (
            <button type="button" onClick={stop(onDuplicate)} aria-label="Duplicate section" title="Duplicate" className={toolbarButton}>
              <DuplicateIcon />
            </button>
          )}
          <button type="button" onClick={stop(onDelete)} aria-label="Delete section" title="Delete" className={`${toolbarButton} hover:bg-red-50 hover:text-red-600`}>
            <DeleteIcon />
          </button>
        </>
      }
    >
      {renderLiveBlock(block, liveData, renderColumn, editing, inlineEdit)}
    </SelectableNode>
  );
}

/** One element inside a row's column, with its own smaller selection
 * outline and a compact reorder/delete toolbar (click-based -- see
 * RowColumnsEditor's removal note on why nested reordering isn't
 * drag-and-drop). */
export function NestedElementFrame({
  block,
  selected,
  onSelect,
  onMoveUp,
  onMoveDown,
  onRemove,
  canMoveUp,
  canMoveDown,
  inlineEdit,
}: {
  block: PageBlock;
  selected: boolean;
  onSelect: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  /** Passed for the selected element when its type has one text field
   * worth editing in place -- see InlineEdit's doc comment in
   * blockViews.tsx. */
  inlineEdit?: InlineEdit;
}) {
  const def = getBlockDef(block.type);
  return (
    <SelectableNode
      depth="nested"
      selected={selected}
      onSelect={onSelect}
      label={def?.label || block.type}
      inert={!inlineEdit}
      actions={
        <>
          <button type="button" disabled={!canMoveUp} onClick={stop(onMoveUp)} aria-label="Move up" className={toolbarButton}>
            ▲
          </button>
          <button type="button" disabled={!canMoveDown} onClick={stop(onMoveDown)} aria-label="Move down" className={toolbarButton}>
            ▼
          </button>
          <button type="button" onClick={stop(onRemove)} aria-label="Delete element" className={`${toolbarButton} hover:bg-red-50 hover:text-red-600`}>
            <DeleteIcon />
          </button>
        </>
      }
    >
      <NestedElement block={block} editableText={inlineEdit} />
    </SelectableNode>
  );
}

export function AddElementButton({ onAdd }: { onAdd: (type: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="rounded-lg border border-dashed border-line py-2 text-xs font-medium text-ink-soft transition-colors hover:border-ink hover:text-ink"
      >
        + Add element
      </button>
      {open && (
        <BlockTypePicker
          title="Add element"
          defs={NESTABLE_DEFS}
          onPick={(type) => {
            onAdd(type);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

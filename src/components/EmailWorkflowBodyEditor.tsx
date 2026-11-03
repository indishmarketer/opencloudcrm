"use client";

import { useRef, useState } from "react";
import RichTextEditor from "@/components/RichTextEditor";

type Variable = { token: string; label: string };
type Mode = "visual" | "html" | "plain" | "inbox";

function htmlToPlain(html: string): string {
  if (typeof DOMParser === "undefined") return html.replace(/<[^>]*>/g, "");
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("br").forEach((node) => node.replaceWith("\n"));
  doc.querySelectorAll("p,div,li,h1,h2,h3,blockquote").forEach((node) => node.append("\n"));
  return (doc.body.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
}

function plainToHtml(text: string): string {
  return text.split(/\n\n+/).map((paragraph) => `<p>${paragraph.replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char]! ).replace(/\n/g, "<br>")}</p>`).join("");
}

export default function EmailWorkflowBodyEditor({ value, onChange, variables }: { value: string; onChange: (html: string) => void; variables: Variable[] }) {
  const [mode, setMode] = useState<Mode>("visual");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modes: { value: Mode; label: string }[] = [
    { value: "visual", label: "Visual editor" }, { value: "html", label: "HTML" },
    { value: "plain", label: "Plain text" }, { value: "inbox", label: "Inbox preview" },
  ];
  function insertVariable(token: string) {
    if (!textareaRef.current) return;
    const input = textareaRef.current;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const content = mode === "plain" ? htmlToPlain(value) : value;
    const next = `${content.slice(0, start)}{{${token}}}${content.slice(end)}`;
    onChange(mode === "plain" ? plainToHtml(next) : next);
    requestAnimationFrame(() => { input.focus(); input.setSelectionRange(start + token.length + 4, start + token.length + 4); });
  }
  const preview = value.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, key: string) => {
    const variable = variables.find((item) => item.token === key);
    return variable ? `[${variable.label}]` : `[${key}]`;
  });

  return <div className="overflow-hidden rounded-xl border border-line">
    <div className="flex flex-wrap gap-1 border-b border-line bg-paper-soft p-2" role="tablist" aria-label="Email body view">
      {modes.map((item) => <button key={item.value} type="button" role="tab" aria-selected={mode === item.value} onClick={() => setMode(item.value)} className={`rounded-full px-3 py-1.5 text-xs font-medium ${mode === item.value ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper hover:text-ink"}`}>{item.label}</button>)}
    </div>
    {(mode === "html" || mode === "plain") && <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2"><span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-ink-soft">Insert variable</span>{variables.map((variable) => <button key={variable.token} type="button" title={`Insert {{${variable.token}}}`} onClick={() => insertVariable(variable.token)} className="rounded-full border border-line bg-paper px-2 py-1 text-[10px] text-ink-soft hover:border-ink hover:text-ink">{variable.label}</button>)}</div>}
    {mode === "visual" && <div className="min-h-56 p-3"><RichTextEditor value={value} onChange={onChange} variables={variables} /></div>}
    {mode === "html" && <textarea ref={textareaRef} aria-label="Email body HTML" rows={14} value={value} onChange={(event) => onChange(event.target.value)} className="block w-full resize-y border-0 bg-paper px-4 py-3 font-mono text-xs leading-5 outline-none focus:ring-0" />}
    {mode === "plain" && <textarea ref={textareaRef} aria-label="Email body plain text" rows={14} value={htmlToPlain(value)} onChange={(event) => onChange(plainToHtml(event.target.value))} className="block w-full resize-y border-0 bg-paper px-4 py-3 text-sm leading-6 outline-none focus:ring-0" />}
    {mode === "inbox" && <div className="bg-paper-soft p-4"><div className="mx-auto max-w-2xl overflow-hidden rounded-xl border border-line bg-paper shadow-sm"><div className="border-b border-line px-5 py-3"><p className="text-xs text-ink-soft">Email preview</p></div><iframe title="Email inbox preview" sandbox="" srcDoc={`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font:15px/1.6 Arial,sans-serif;color:#222;margin:0;padding:24px;overflow-wrap:anywhere}img{max-width:100%;height:auto}a{color:#2457a6}</style></head><body>${preview}</body></html>`} className="h-[420px] w-full border-0" /></div></div>}
  </div>;
}

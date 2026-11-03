"use client";

import { useRef, useState } from "react";
import ConsoleModal from "@/components/ConsoleModal";
import BrandSelect from "@/components/BrandSelect";
import { parseCsv } from "@/lib/csv";

type FieldTarget = "skip" | "email" | "name" | "phone";

const FIELD_OPTIONS: { value: FieldTarget; label: string }[] = [
  { value: "skip", label: "Don't import" },
  { value: "email", label: "Email" },
  { value: "name", label: "Name" },
  { value: "phone", label: "Phone" },
];

function guessTarget(header: string): FieldTarget {
  const h = header.trim().toLowerCase();
  if (/e-?mail/.test(h)) return "email";
  if (/phone|mobile|contact\s*no|whatsapp/.test(h)) return "phone";
  if (/name/.test(h)) return "name";
  return "skip";
}

const MAX_ROWS = 5000;

export default function ImportContactsModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [step, setStep] = useState<"upload" | "map" | "done">("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<FieldTarget[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    setError("");
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const rows = parseCsv(text);
      if (rows.length === 0) {
        setError("This file appears to be empty.");
        return;
      }
      const [headerRow, ...rest] = rows;
      if (rest.length === 0) {
        setError("No data rows found below the header.");
        return;
      }
      if (rest.length > MAX_ROWS) {
        setError(`This file has ${rest.length} rows. Import is limited to ${MAX_ROWS} at a time -- split it into smaller files.`);
        return;
      }
      setFileName(file.name);
      setHeaders(headerRow);
      setDataRows(rest);
      setMapping(headerRow.map(guessTarget));
      setStep("map");
    };
    reader.onerror = () => setError("Could not read this file.");
    reader.readAsText(file);
  }

  const emailColumnCount = mapping.filter((m) => m === "email").length;
  const validEmailRows = dataRows.filter((row) => {
    const emailIdx = mapping.findIndex((m) => m === "email");
    if (emailIdx === -1) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((row[emailIdx] || "").trim());
  }).length;

  function buildMappedRows(): { email: string; name?: string; phone?: string }[] {
    const nameIdxs = mapping.map((m, i) => (m === "name" ? i : -1)).filter((i) => i !== -1);
    const phoneIdxs = mapping.map((m, i) => (m === "phone" ? i : -1)).filter((i) => i !== -1);
    const emailIdxs = mapping.map((m, i) => (m === "email" ? i : -1)).filter((i) => i !== -1);
    return dataRows.map((row) => {
      const email = emailIdxs.map((i) => (row[i] || "").trim()).find((v) => v) || "";
      const name = nameIdxs.map((i) => (row[i] || "").trim()).filter(Boolean).join(" ");
      const phone = phoneIdxs.map((i) => (row[i] || "").trim()).find((v) => v) || "";
      return { email, name: name || undefined, phone: phone || undefined };
    });
  }

  async function handleImport() {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/console/contacts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: buildMappedRows() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || "Import failed.");
        setSubmitting(false);
        return;
      }
      setResult(body);
      setStep("done");
    } catch {
      setError("Import failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ConsoleModal title="Import contacts" onClose={onClose} wide={step === "map"}>
      {step === "upload" && (
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">
            Upload a CSV file. You&rsquo;ll map its columns to email, name, and phone on the next step.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-80"
          >
            Choose CSV file…
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}

      {step === "map" && (
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">
            {fileName} · {dataRows.length} row{dataRows.length === 1 ? "" : "s"}
          </p>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-paper-soft text-ink-soft">
                <tr>
                  <th className="px-3 py-2 font-medium">Column</th>
                  <th className="px-3 py-2 font-medium">Sample value</th>
                  <th className="px-3 py-2 font-medium">Maps to</th>
                </tr>
              </thead>
              <tbody>
                {headers.map((header, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 font-medium">{header || `Column ${i + 1}`}</td>
                    <td className="max-w-[12rem] truncate px-3 py-2 text-ink-soft">{dataRows[0]?.[i] || "—"}</td>
                    <td className="px-3 py-2">
                      <BrandSelect
                        compact
                        value={mapping[i]}
                        onChange={(value) =>
                          setMapping((prev) => prev.map((m, idx) => (idx === i ? (value as FieldTarget) : m)))
                        }
                        options={FIELD_OPTIONS}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {emailColumnCount === 0 && <p className="text-sm text-red-600">Map one column to Email to continue.</p>}
          {emailColumnCount > 0 && (
            <p className="text-sm text-ink-soft">
              {validEmailRows} of {dataRows.length} rows have a usable email address. Rows without one are skipped.
            </p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep("upload")}
              className="rounded-full border border-line px-5 py-2.5 text-sm font-medium transition-colors hover:border-ink"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={emailColumnCount === 0 || validEmailRows === 0 || submitting}
              className="flex-1 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              {submitting ? "Importing…" : `Import ${validEmailRows} contact${validEmailRows === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      )}

      {step === "done" && result && (
        <div className="space-y-4">
          <p className="text-sm">
            <span className="font-medium">{result.created}</span> new contact{result.created === 1 ? "" : "s"} created,{" "}
            <span className="font-medium">{result.updated}</span> existing contact{result.updated === 1 ? "" : "s"} updated
            {result.skipped > 0 && (
              <>
                , <span className="font-medium">{result.skipped}</span> row{result.skipped === 1 ? "" : "s"} skipped
              </>
            )}
            .
          </p>
          <button
            type="button"
            onClick={onImported}
            className="w-full rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-80"
          >
            Done
          </button>
        </div>
      )}
    </ConsoleModal>
  );
}

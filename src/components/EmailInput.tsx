"use client";

import { useId, useMemo, useRef, useState } from "react";
import { computeEmailSuggestion, detectEmailTypo } from "@/lib/emailValidation";

export type EmailInputProps = {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  name?: string;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
  onBlur?: () => void;
};

export default function EmailInput({
  value,
  onChange,
  id,
  name = "email",
  placeholder = "name@email.com",
  required = false,
  autoComplete = "email",
  className,
  style,
  disabled = false,
  onBlur,
}: EmailInputProps) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const inputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Auto-suggestion analysis
  const { ghostSuffix, matchedDomain, suggestions } = useMemo(() => {
    if (!isFocused) return { ghostSuffix: null, matchedDomain: null, suggestions: [] };
    return computeEmailSuggestion(value);
  }, [value, isFocused]);

  // Typo check (e.g. icliud.com, .con)
  const typoResult = useMemo(() => {
    return detectEmailTypo(value);
  }, [value]);

  const atIndex = value.lastIndexOf("@");
  const hasAt = atIndex !== -1;
  const domainPart = hasAt ? value.slice(atIndex + 1).toLowerCase() : "";

  function acceptSuggestion(domain: string) {
    if (atIndex === -1) {
      onChange(`${value}@${domain}`);
    } else {
      const userPart = value.slice(0, atIndex);
      onChange(`${userPart}@${domain}`);
    }
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Tab or Right Arrow accepts active ghost suggestion
    if ((e.key === "Tab" || e.key === "ArrowRight") && matchedDomain && ghostSuffix) {
      e.preventDefault();
      acceptSuggestion(matchedDomain);
      return;
    }

    // Space after typing @domain prefix accepts suggestion
    if (e.key === " " && hasAt && domainPart && matchedDomain) {
      e.preventDefault();
      acceptSuggestion(matchedDomain);
      return;
    }
  }

  return (
    <div className="relative w-full">
      <div className="relative flex items-center">
        {/* Real Input */}
        <input
          ref={inputRef}
          id={inputId}
          name={name}
          type="email"
          required={required}
          autoComplete={autoComplete}
          placeholder={placeholder}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            // Slight delay so chip clicks register before blur closes suggestions
            setTimeout(() => setIsFocused(false), 200);
            onBlur?.();
          }}
          onKeyDown={handleKeyDown}
          className={
            className ||
            "w-full rounded-xl border border-line bg-paper px-4 py-3 text-sm outline-none transition focus:border-ink disabled:opacity-60"
          }
          style={style}
        />

        {/* Inline Ghost Suggestion badge if available */}
        {ghostSuffix && isFocused && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => matchedDomain && acceptSuggestion(matchedDomain)}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md bg-paper-soft px-2 py-0.5 text-xs text-ink-soft hover:text-ink border border-line"
            title="Press Tab or click to complete"
          >
            Tab ⇥ {ghostSuffix}
          </button>
        )}
      </div>

      {/* Domain Suggestion Chips when typing @ */}
      {isFocused && hasAt && suggestions.length > 0 && domainPart !== matchedDomain && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 animate-fadeIn">
          <span className="text-[11px] font-medium text-ink-soft">Suggested:</span>
          {suggestions.slice(0, 4).map((domain) => (
            <button
              key={domain}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                acceptSuggestion(domain);
              }}
              className="rounded-full border border-line bg-paper px-2.5 py-0.5 text-xs text-ink transition-colors hover:border-ink hover:bg-paper-soft"
            >
              @{domain}
            </button>
          ))}
        </div>
      )}

      {/* Typo Detection Warning & 1-Click Fix */}
      {typoResult.hasTypo && typoResult.suggestedEmail && (
        <div className="mt-1.5 flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
          <span>
            Did you mean <strong className="font-semibold">{typoResult.suggestedEmail}</strong>?
          </span>
          <button
            type="button"
            onClick={() => typoResult.suggestedEmail && onChange(typoResult.suggestedEmail)}
            className="ml-2 rounded-md bg-amber-200 px-2 py-0.5 font-medium text-amber-950 transition hover:bg-amber-300"
          >
            Fix typo
          </button>
        </div>
      )}
    </div>
  );
}

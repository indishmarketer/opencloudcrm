"use client";

import { useState, useCallback, useRef } from "react";

type ConfirmOptions = {
  message: string;
  confirmLabel?: string;
};

/** Branded replacement for window.confirm(). Renders nothing until asked;
 * call the returned `confirm(options)` and await it, it resolves true/false
 * once the user picks a button. Mount <ConfirmDialogRoot /> once near the
 * root of the tree that needs it. */
export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<(value: boolean) => void>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  function handle(result: boolean) {
    setOptions(null);
    resolver.current?.(result);
  }

  const dialog = options ? (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/50 px-6" onMouseDown={(event) => { if (event.target === event.currentTarget) handle(false); }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-message" className="w-full max-w-sm rounded-2xl border border-line bg-paper p-6 shadow-xl">
        <p id="confirm-dialog-message" className="text-sm">{options.message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => handle(false)}
            className="rounded-full border border-line px-4 py-2 text-sm font-medium transition-colors hover:border-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => handle(true)}
            className="rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            {options.confirmLabel || "Delete"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, dialog };
}

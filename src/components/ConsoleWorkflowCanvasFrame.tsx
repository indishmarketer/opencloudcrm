"use client";

export default function ConsoleWorkflowCanvasFrame({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-0 z-40 h-[100dvh] overflow-hidden bg-paper">{children}</div>;
}

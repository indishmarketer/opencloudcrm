import { Fragment } from "react";

const steps = [
  {
    verb: "Capture",
    label: "Lead comes in from any channel",
    icon: (
      <path d="M4 12h5l2 3h2l2-3h5M4 12l2.5-6.5A1 1 0 0 1 7.44 5h9.12a1 1 0 0 1 .94.5L20 12M4 12v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6" />
    ),
  },
  {
    verb: "Qualify",
    label: "AI agent asks the right questions",
    icon: (
      <>
        <path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 4v-4H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
        <path d="M9 10.5l2 2 4-4.5" />
      </>
    ),
  },
  {
    verb: "Book",
    label: "Call goes straight on the calendar",
    icon: (
      <>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M4 10h16M8 3v4M16 3v4" />
      </>
    ),
  },
  {
    verb: "Sync",
    label: "Lead data lands in your OS",
    icon: (
      <path d="M4 12a8 8 0 0 1 13.66-5.66M20 12a8 8 0 0 1-13.66 5.66M17 4v4h-4M7 20v-4h4" />
    ),
  },
];

/** Four steps, each given the same card weight as the "What we do" pillars
 * above it on the page -- a plain numbered circle read as an afterthought
 * next to those. The traveling dot along the connecting line is unchanged;
 * only the per-step presentation (bare circle -> icon + verb + label card)
 * is new. */
export default function WorkflowDemo() {
  return (
    <div className="rounded-2xl border border-line bg-paper p-6 sm:p-8">
      <div className="flex flex-col sm:flex-row sm:items-stretch">
        {steps.map((step, i) => (
          <Fragment key={step.verb}>
            <div className="flex w-full flex-1 items-center gap-4 rounded-xl border border-line bg-paper p-5 sm:flex-col sm:items-start sm:text-left">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-7 w-7 shrink-0 text-ink"
              >
                {step.icon}
              </svg>
              <div className="flex-1">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-soft">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[10px] font-semibold text-paper">
                    {i + 1}
                  </span>
                  {step.verb}
                </p>
                <p className="mt-1.5 min-h-[2.5rem] text-sm text-ink-soft">{step.label}</p>
              </div>
            </div>
            {i < steps.length - 1 && (
              <div className="relative my-3 h-8 w-px self-center sm:my-0 sm:h-px sm:w-4 sm:shrink-0 lg:w-8">
                <div className="absolute inset-0 border-l border-dashed border-ink/20 sm:border-l-0 sm:border-t" />
                <div className="workflow-dot-vertical absolute left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-ink sm:hidden" />
                <div className="workflow-dot-horizontal absolute top-1/2 hidden h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-ink sm:block" />
              </div>
            )}
          </Fragment>
        ))}
      </div>
      <style>{`
        @keyframes workflow-travel-h {
          0% { left: 0%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { left: 100%; opacity: 0; }
        }
        @keyframes workflow-travel-v {
          0% { top: 0%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        .workflow-dot-horizontal {
          animation: workflow-travel-h 2.4s ease-in-out infinite;
        }
        .workflow-dot-vertical {
          animation: workflow-travel-v 1.6s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .workflow-dot-horizontal, .workflow-dot-vertical {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}

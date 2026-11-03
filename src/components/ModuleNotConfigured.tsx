/** Shown in place of a console section whose required env vars aren't
 * set, so the page explains itself instead of erroring or showing empty
 * data with no context. Generalized from the WhatsApp-only version of
 * this -- same card, reusable for any optional module. */
export default function ModuleNotConfigured({ title, envVars }: { title: string; envVars: string[] }) {
  return (
    <div className="rounded-2xl border border-dashed border-line p-10 text-center">
      <p className="font-medium">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
        Set{" "}
        {envVars.map((name, i) => (
          <span key={name}>
            <code className="rounded bg-paper-soft px-1">{name}</code>
            {i < envVars.length - 2 ? ", " : i === envVars.length - 2 ? " and " : ""}
          </span>
        ))}{" "}
        in the server environment, then reload this page.
      </p>
    </div>
  );
}

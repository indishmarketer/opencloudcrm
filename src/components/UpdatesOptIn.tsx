/** The consent checkboxes: one for email, one for WhatsApp.
 *
 * They are separate on purpose. The email box has never mentioned WhatsApp,
 * so it was not usable as WhatsApp consent, and that single missing
 * question is what blocked every WhatsApp marketing send (see migration
 * 118's comment). WhatsApp is also a stricter channel: it lands on
 * someone's phone next to messages from people they know, and Meta scores
 * the sending number on how often people block it.
 *
 * The WhatsApp row only appears on forms that actually collect a phone
 * number, and stays disabled until one is typed, because consent without a
 * number is a promise nothing can keep. */
export default function UpdatesOptIn({
  checked,
  onChange,
  whatsapp,
  onWhatsAppChange,
  hasPhone = true,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Omit both WhatsApp props on a form with no phone field. */
  whatsapp?: boolean;
  onWhatsAppChange?: (checked: boolean) => void;
  hasPhone?: boolean;
}) {
  const showWhatsApp = typeof whatsapp === "boolean" && !!onWhatsAppChange;

  return (
    <div className="space-y-2">
      <label className="flex items-start gap-2 text-sm text-ink-soft">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5"
        />
        <span>Email me occasional updates, tips, and requests for feedback. You can unsubscribe anytime.</span>
      </label>

      {showWhatsApp && (
        <label className="flex items-start gap-2 text-sm text-ink-soft">
          <input
            type="checkbox"
            checked={hasPhone && whatsapp}
            disabled={!hasPhone}
            onChange={(e) => onWhatsAppChange?.(e.target.checked)}
            className="mt-0.5 disabled:opacity-50"
          />
          <span className={hasPhone ? undefined : "opacity-60"}>
            Send me the same updates on WhatsApp. Reply STOP any time to end them.
            {!hasPhone && " Add your phone number above first."}
          </span>
        </label>
      )}
    </div>
  );
}

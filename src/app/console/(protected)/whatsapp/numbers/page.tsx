import WhatsAppAddNumberModal from "@/components/WhatsAppAddNumberModal";
import ModuleNotConfigured from "@/components/ModuleNotConfigured";
import { FEATURES } from "@/config/features";
import WhatsAppNumberPicker from "@/components/WhatsAppNumberPicker";
import WhatsAppNumberProfile from "@/components/WhatsAppNumberProfile";
import WhatsAppNumberRegister from "@/components/WhatsAppNumberRegister";
import { listWhatsAppPhoneNumbers } from "@/lib/whatsappTemplates";
import { PURPOSE_LABELS, SENDING_PURPOSES, sendingNumbers, type SendingPurpose } from "@/lib/whatsappSender";

export const dynamic = "force-dynamic";

/** "TIER_1K" -> "1K business-initiated conversations per day". Meta leaves
 * this empty on numbers that haven't sent enough to be tiered yet, which is
 * not the same as having no limit, so say so rather than "not set". */
function tierLabel(tier: string | null | undefined): string {
  if (!tier) return "Daily limit not reported yet";
  const amount = tier.replace(/^TIER_/, "");
  if (amount === "UNLIMITED") return "Unlimited per day";
  return `${amount} business-initiated conversations per day`;
}

/** Meta's own traffic-light wording, shown as an actual traffic light. The
 * word "GREEN" in grey text is the one thing on this page that should be
 * readable at a glance and wasn't. */
const QUALITY: Record<string, { label: string; className: string }> = {
  GREEN: { label: "Quality: high", className: "bg-green-100 text-green-800" },
  YELLOW: { label: "Quality: medium", className: "bg-amber-100 text-amber-800" },
  RED: { label: "Quality: low", className: "bg-red-100 text-red-700" },
  UNKNOWN: { label: "Quality: not rated yet", className: "bg-paper-soft text-ink-soft" },
};

export default async function WhatsAppNumbersPage() {
  if (!FEATURES.whatsapp) return <ModuleNotConfigured title="WhatsApp isn't connected yet" envVars={["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_WABA_ID"]} />;

  let numbers;
  try {
    numbers = await listWhatsAppPhoneNumbers();
  } catch (e) {
    return (
      <p className="rounded-2xl border border-line bg-paper-soft p-6 text-sm text-red-600">
        Could not reach WhatsApp: {e instanceof Error ? e.message : "unknown error"}
      </p>
    );
  }

  const routing = await sendingNumbers();
  // What each number is responsible for. A kind with nothing of its own
  // falls to the default number, so say that on the default's row rather
  // than leaving the reader to work it out.
  const purposesFor = (id: string): SendingPurpose[] =>
    SENDING_PURPOSES.filter((purpose) => routing[purpose] === id);
  const inherited = SENDING_PURPOSES.filter((p) => p !== "default" && !routing[p]).map((p) => PURPOSE_LABELS[p]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-2xl text-sm text-ink-soft">
          Each number can take a different kind of message. Marketing is what people block and report, and a number&apos;s
          quality rating sets its daily limit, so running campaigns from one number keeps confirmations and passcodes
          safe on another. A kind with no number of its own uses whichever handles everything, and an open
          conversation always replies from the number it arrived on.
        </p>
        <WhatsAppAddNumberModal wabaId={process.env.WHATSAPP_WABA_ID} />
      </div>

      <div className="space-y-3">
        {numbers.map((number) => {
          const quality = QUALITY[number.quality_rating || "UNKNOWN"] || QUALITY.UNKNOWN;
          return (
            <div key={number.id} className="rounded-2xl border border-line bg-paper p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{number.display_phone_number}</p>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${quality.className}`}>
                      {quality.label}
                    </span>
                    {number.status && number.status !== "CONNECTED" && (
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
                        {number.status.toLowerCase()}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-sm text-ink-soft">
                    {number.verified_name}
                    {number.new_name_status === "PENDING_REVIEW" && (
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                        name change in review
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-ink-soft">
                    {tierLabel(number.messaging_limit_tier)}
                    {number.code_verification_status ? ` · ${number.code_verification_status.toLowerCase()}` : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {purposesFor(number.id).length === 0 ? (
                      <span className="text-xs text-ink-soft">Sends nothing right now</span>
                    ) : (
                      purposesFor(number.id).map((purpose) => (
                        <span key={purpose} className="rounded-full bg-ink px-2.5 py-1 text-xs font-medium text-paper">
                          {PURPOSE_LABELS[purpose]}
                        </span>
                      ))
                    )}
                    {routing.default === number.id && inherited.length > 0 && (
                      <span className="text-xs text-ink-soft">({inherited.join(", ").toLowerCase()})</span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  {number.status === "PENDING" && (
                    <WhatsAppNumberRegister
                      phoneNumberId={number.id}
                      displayNumber={number.display_phone_number}
                    />
                  )}
                  <WhatsAppNumberProfile
                    phoneNumberId={number.id}
                    displayNumber={number.display_phone_number}
                  />
                  <WhatsAppNumberPicker
                    phoneNumberId={number.id}
                    displayNumber={number.display_phone_number}
                    assigned={purposesFor(number.id)}
                  />
                </div>
              </div>
            </div>
          );
        })}
        {numbers.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line p-10 text-center">
            <p className="font-medium">No numbers connected</p>
          </div>
        )}
      </div>
    </div>
  );
}

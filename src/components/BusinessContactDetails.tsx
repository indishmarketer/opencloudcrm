import type { ResolvedBusiness } from "@/lib/businessProfile";

/** Contact details as icon rows (the "Contact details" and "Contact form"
 * page sections). Data comes from Console -> Site settings; rows with no
 * value are left out. */

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line text-ink">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </span>
  );
}

const PinIcon = () => (
  <Icon>
    <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </Icon>
);
const MailIcon = () => (
  <Icon>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </Icon>
);
const PhoneIcon = () => (
  <Icon>
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
  </Icon>
);
const ClockIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icon>
);

const link = "underline-offset-2 transition-colors hover:text-ink hover:underline";

export default function BusinessContactDetails({ business }: { business: ResolvedBusiness }) {
  if (!business.emails.length && !business.phone && !business.hours && !business.addressOneLine) {
    return <p className="text-sm text-ink-soft">Add your contact details under Console &rarr; Site settings.</p>;
  }
  return (
    <ul className="space-y-5 text-sm text-ink-soft">
      {business.emails.length > 0 && (
        <li className="flex items-start gap-3">
          <MailIcon />
          <div className="min-w-0">
            <p className="font-medium text-ink">Email</p>
            {business.emails.map((email) => (
              <a key={email} href={`mailto:${email}`} className={`block break-words ${link}`}>
                {email}
              </a>
            ))}
          </div>
        </li>
      )}
      {business.phone && (
        <li className="flex items-start gap-3">
          <PhoneIcon />
          <div>
            <p className="font-medium text-ink">Phone</p>
            <a href={business.phoneHref} className={link}>
              {business.phone}
            </a>
          </div>
        </li>
      )}
      {business.hours && (
        <li className="flex items-start gap-3">
          <ClockIcon />
          <div>
            <p className="font-medium text-ink">Hours</p>
            <p>{business.hours}</p>
          </div>
        </li>
      )}
      {business.addressOneLine && (
        <li className="flex items-start gap-3">
          <PinIcon />
          <div>
            <p className="font-medium text-ink">Address</p>
            <address className="not-italic">{business.addressOneLine}</address>
          </div>
        </li>
      )}
    </ul>
  );
}

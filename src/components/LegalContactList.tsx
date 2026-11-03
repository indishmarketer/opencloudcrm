import type { ResolvedBusiness } from "@/lib/businessProfile";

/** The "Contact us" list at the bottom of each legal page. Each line only
 * appears when that detail is filled in under Console -> Site settings. */
export default function LegalContactList({ business }: { business: ResolvedBusiness }) {
  return (
    <ul className="list-none">
      {business.emails.length > 0 && (
        <li>
          Email:{" "}
          {business.emails.map((email, i) => (
            <span key={email}>
              {i > 0 && " or "}
              <a href={`mailto:${email}`} className="text-ink underline">
                {email}
              </a>
            </span>
          ))}
        </li>
      )}
      {business.phone && (
        <li>
          Phone:{" "}
          <a href={business.phoneHref} className="text-ink underline">
            {business.phone}
          </a>
          {business.hours && ` (${business.hours})`}
        </li>
      )}
      {business.addressOneLine && <li>Address: {business.addressOneLine}</li>}
    </ul>
  );
}

import { notFound } from "next/navigation";

/** Retired preview route. The only newsletter page is the hardcoded
 * /newsletter implementation. */
export default function RetiredNewsletterPreview(): never {
  notFound();
}

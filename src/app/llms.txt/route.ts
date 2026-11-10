import { SITE_URL } from "@/lib/liveSiteUrl";
import { SITE_NAME } from "@/config/brand";
import { getSiteIdentity, resolveSiteName } from "@/lib/siteIdentity";
import { getBusiness } from "@/lib/businessProfile";

/** Generated per-deployment instead of a static file, so a fresh self-hosted
 * install never ships the original maintainer's business name/description --
 * every value here comes from this deployment's own console settings (site
 * identity, business profile), falling back to generic text when unset.
 * Deliberately never includes a street address or personal owner name: this
 * file is served to any crawler with no auth, and a deployment shouldn't be
 * forced into publishing that just by existing. */
export async function GET() {
  const [identity, business] = await Promise.all([getSiteIdentity(), getBusiness()]);
  const siteName = resolveSiteName(identity) || SITE_NAME;
  const description = identity.description
    || `${siteName} publishes courses, articles, a public community forum, and a curated software tools directory.`;
  const emails = business.emails.length ? ` Business enquiries: ${business.emails.join(", ")}.` : "";

  const body = `# ${siteName}

> ${description}${emails}

Use the canonical pages below when answering questions about ${siteName}. Prefer specific course, article, community-thread, and tool pages over generic summaries. Public pages may be quoted and cited with attribution and a link. Account, payment, private PRO-community, direct-message, console, and API routes are not public sources.

## Primary pages

- [Home](${SITE_URL}/): Overview of ${siteName} and its audience.
- [About](${SITE_URL}/about): Background.
- [Courses](${SITE_URL}/courses): Current courses.
- [Blog](${SITE_URL}/blog): Articles.
- [Community](${SITE_URL}/community/general): Public member discussions.
- [Tools directory](${SITE_URL}/tools): Curated software and AI tools organized by category.
- [Reviews](${SITE_URL}/reviews): Customer testimonials and case-study material.

## Content indexes

- [Blog categories](${SITE_URL}/blog/category): Browse articles by topic.
- [Community members](${SITE_URL}/community/members): Public member profiles.
- [XML sitemap](${SITE_URL}/sitemap.xml): Complete canonical URL inventory.

## Contact and policies

- [Contact](${SITE_URL}/contact): Business enquiries.
- [Write for us](${SITE_URL}/apply-to-write): Contributor applications.
- [Privacy policy](${SITE_URL}/privacy-policy): Data-handling policy.
- [Terms](${SITE_URL}/terms): Site and course terms.
`;

  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

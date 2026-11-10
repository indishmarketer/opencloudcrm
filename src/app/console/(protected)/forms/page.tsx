import ConsoleForms from "@/components/ConsoleForms";
import { listForms } from "@/lib/forms";

export const dynamic = "force-dynamic";

/** Every form the site can show, built-in or saved, finally in one place --
 * see ConsoleForms for the "why": each built-in form used to be an
 * invisible hardcoded component with no shared identity. */
const BUILT_IN_FORMS = [
  { name: "Contact form", where: "Page builder -> \"Form\" block, Contact type", edit: "/console/pages" },
  { name: "Newsletter signup", where: "Page builder -> \"Form\" block, Newsletter type, and the blog popup", edit: "/console/pages" },
  { name: "Free guide (lead magnet) popup", where: "Homepage hero button, \"free-guide popup\" action", edit: "/console/lead-magnets" },
  { name: "Tool directory submission", where: "/tools/submit", edit: "/console/directory" },
  { name: "Review submission", where: "/reviews, review request emails", edit: "/console/reviews" },
  { name: "Webinar registration", where: "Each webinar's registration step", edit: "/console/webinars" },
  { name: "Sign up / Log in", where: "/signup, /login", edit: "/console/site-settings" },
];

export default async function ConsoleFormsPage() {
  const forms = await listForms();

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold sm:text-3xl">Forms</h1>
      <p className="mt-3 max-w-2xl text-sm text-ink-soft">
        Every form on the site. The built-in ones below have fixed fields, but their copy is editable where
        linked. Forms you create here have their own fields, labels and design, and can be placed as a page
        section or opened as a popup from any button.
      </p>
      <ConsoleForms forms={forms} builtIn={BUILT_IN_FORMS} />
    </div>
  );
}

import { redirect } from "next/navigation";

// The Image tab is now the site's homepage (see src/app/page.js) -- this
// route just forwards old /image links (and the `?from=<slug>` a project
// page sends when navigating back into the carousel) on to "/" instead of
// 404ing.
export default async function ImagePageRedirect({ searchParams }) {
  const params = (await searchParams) ?? {};
  const qs = new URLSearchParams(params).toString();
  redirect(qs ? `/?${qs}` : "/");
}

/**
 * Signing in moved to the scouting client at `/` (#359). An old link, or a bookmark, still works.
 */
import { redirect } from "next/navigation";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { join } = await searchParams;
  redirect(typeof join === "string" ? `/?join=${encodeURIComponent(join)}` : "/");
}

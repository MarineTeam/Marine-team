import Link from "next/link";
import { getCurrentUser, getSessionIdentity } from "@/lib/current-user";

export async function Navbar() {
  const [user, identity] = await Promise.all([getCurrentUser(), getSessionIdentity()]);
  const unauthorized = !user && identity !== null;

  return (
    <header className="border-b border-zinc-200 bg-white/80 backdrop-blur sticky top-0 z-10 dark:bg-zinc-950/80 dark:border-zinc-800">
      <nav className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/" className="font-semibold text-lg tracking-tight shrink-0">
          Media Library
        </Link>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:gap-4 text-sm">
          <Link href="/" className="hover:underline">
            Browse
          </Link>
          {user?.role === "ADMIN" && (
            <Link href="/admin" className="hover:underline">
              Admin
            </Link>
          )}
          {user ? (
            <>
              <span className="text-zinc-500 max-w-[10rem] sm:max-w-none truncate">
                {user.name ?? user.email}
              </span>
              <a
                href="/auth/logout"
                className="rounded-md border border-zinc-300 px-3 py-1 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Log out
              </a>
            </>
          ) : unauthorized ? (
            <>
              <span className="text-amber-600 dark:text-amber-500">Access not authorized</span>
              <a
                href="/auth/logout"
                className="rounded-md border border-zinc-300 px-3 py-1 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Log out
              </a>
            </>
          ) : (
            <a
              href="/auth/login"
              className="rounded-md bg-zinc-900 text-white px-3 py-1 hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
            >
              Log in
            </a>
          )}
        </div>
      </nav>
    </header>
  );
}

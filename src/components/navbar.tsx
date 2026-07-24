import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";

export async function Navbar() {
  const user = await getCurrentUser();

  return (
    <header className="border-b border-zinc-200 bg-white/80 backdrop-blur sticky top-0 z-10 dark:bg-zinc-950/80 dark:border-zinc-800">
      <nav className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
        <Link href="/" className="font-semibold text-lg tracking-tight">
          Media Library
        </Link>
        <div className="flex items-center gap-4 text-sm">
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
              <span className="text-zinc-500">{user.name ?? user.email}</span>
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

import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";

const links = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/series", label: "Series" },
  { href: "/admin/videos", label: "Videos" },
  { href: "/admin/files", label: "Files" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?returnTo=/admin");
  if (user.role !== "ADMIN") {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="font-medium">You don&apos;t have access to the admin dashboard.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 flex gap-8">
      <aside className="w-48 shrink-0">
        <nav className="space-y-1 text-sm">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="block rounded-md px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

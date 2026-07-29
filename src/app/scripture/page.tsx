import Link from "next/link";
import { getScriptureBooks } from "@/lib/content";
import { getCurrentUser } from "@/lib/current-user";

export default async function ScriptureIndexPage() {
  const user = await getCurrentUser();
  const books = await getScriptureBooks(Boolean(user));

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Browse by scripture</h1>

      {books.length === 0 ? (
        <p className="text-zinc-500">No videos have scripture references yet.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {books.map((book) => (
            <Link
              key={book}
              href={`/scripture/${encodeURIComponent(book)}`}
              className="rounded-full border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              {book}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

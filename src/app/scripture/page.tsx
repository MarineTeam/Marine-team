import Link from "next/link";
import { getScriptureBooks } from "@/lib/content";
import { getCurrentUser } from "@/lib/current-user";

export default async function ScriptureIndexPage() {
  const user = await getCurrentUser();
  const books = await getScriptureBooks(Boolean(user));

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
      <h1 className="text-3xl font-bold tracking-tight text-ink">Browse by scripture</h1>

      {books.length === 0 ? (
        <p className="text-sec">No videos have scripture references yet.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {books.map((book) => (
            <Link
              key={book}
              href={`/scripture/${encodeURIComponent(book)}`}
              className="rounded-full border border-sep px-3 py-1.5 text-sm hover:bg-hover"
            >
              {book}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

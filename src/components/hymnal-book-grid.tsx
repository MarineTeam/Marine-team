import { BookCard, type BookCardData } from "@/components/book-card";

/** Grid of hymnal book covers for a hymnalStyle category or series — see Category.hymnalStyle and lib/hymnal.ts. */
export function HymnalBookGrid({ books }: { books: BookCardData[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {books.map((book) => (
        <BookCard key={book.href} book={book} />
      ))}
    </div>
  );
}

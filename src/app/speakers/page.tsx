import { MenuTile } from "@/components/menu-tile";
import { getSpeakers } from "@/lib/content";

export default async function SpeakersPage() {
  const speakers = await getSpeakers();

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
      <h1 className="text-3xl font-bold tracking-tight text-ink">Speakers</h1>

      {speakers.length === 0 ? (
        <p className="text-sec">No speakers listed yet.</p>
      ) : (
        <div className="space-y-3">
          {speakers.map((s) => (
            <MenuTile key={s.id} href={`/speakers/${s.slug}`} title={s.name} subtitle={s.bio} thumbnailUrl={s.photoUrl} />
          ))}
        </div>
      )}
    </div>
  );
}

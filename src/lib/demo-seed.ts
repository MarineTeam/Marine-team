import type { PrismaClient } from "@prisma/client";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const HYMN_AUDIO = [
  "/demo/audio/hymn-1.wav",
  "/demo/audio/hymn-2.wav",
  "/demo/audio/hymn-3.wav",
  "/demo/audio/hymn-4.wav",
];

const HYMN_TITLES = [
  "Amazing Grace",
  "How Great Thou Art",
  "Blessed Assurance",
  "It Is Well With My Soul",
  "Great Is Thy Faithfulness",
  "Be Thou My Vision",
];

/**
 * Populates a database with demo content: English Hymnals (hymnal
 * collections with playable audio), Featured Message Series (sermon
 * series, one members-only), Meeting Sharings, and Resources — mirroring
 * a real Subsplash church media site's structure with original content.
 * Safe to call more than once: returns early if it looks already seeded.
 */
export async function seedDemoContent(prisma: PrismaClient): Promise<{ seeded: boolean }> {
  const existing = await prisma.category.findUnique({ where: { slug: "english-hymnals" } });
  if (existing) {
    return { seeded: false };
  }

  // --- English Hymnals: category -> hymnal collections (series) -> songs (audio files) ---
  const hymnals = await prisma.category.create({
    data: { name: "English Hymnals", slug: "english-hymnals", position: 0 },
  });

  const hymnalCollections = [
    { title: "Hymns of Grace 1", cover: "hymnal-collection-a" },
    { title: "Hymns of Grace 2", cover: "hymnal-collection-b" },
    { title: "Songs of Praise 1", cover: "hymnal-collection-c" },
    { title: "Songs of Praise 2", cover: "hymnal-collection-d" },
    { title: "Hymnal Collection 2024", cover: "hymnal-collection-e" },
  ];

  for (const [i, collection] of hymnalCollections.entries()) {
    const series = await prisma.series.create({
      data: {
        title: collection.title,
        slug: slugify(collection.title),
        description: "A collection of classic hymns for congregational singing.",
        coverImageUrl: `/demo/covers/${collection.cover}.svg`,
        published: true,
        position: i,
        categoryId: hymnals.id,
        updatedAt: new Date(Date.now() - i * 6 * 60 * 60 * 1000),
      },
    });

    const songCount = 3 + (i % 2);
    for (let s = 0; s < songCount; s++) {
      const title = HYMN_TITLES[(i + s) % HYMN_TITLES.length];
      await prisma.fileAsset.create({
        data: {
          title,
          bunnyPath: `demo/${slugify(collection.title)}/${slugify(title)}.wav`,
          url: HYMN_AUDIO[(i + s) % HYMN_AUDIO.length],
          mimeType: "audio/wav",
          published: true,
          position: s,
          seriesId: series.id,
        },
      });
    }
  }

  // --- Featured Message Series: category -> sermon series -> demo videos ---
  const messages = await prisma.category.create({
    data: { name: "Featured Message Series", slug: "featured-message-series", position: 1 },
  });

  const sermonSeries = [
    {
      title: "Faith That Endures",
      cover: "sermon-series-a",
      parts: ["Foundations", "Trials and Growth", "Living It Out"],
    },
    {
      title: "Walking in the Spirit",
      cover: "sermon-series-b",
      parts: ["What Is the Spirit-Filled Life?", "Fruit of the Spirit", "Gifts for the Church"],
    },
    {
      title: "The Sermon on the Mount",
      cover: "sermon-series-c",
      parts: ["The Beatitudes", "Salt and Light", "Prayer and Fasting", "A House on the Rock"],
      memberOnly: true,
    },
  ];

  for (const [i, series] of sermonSeries.entries()) {
    const createdSeries = await prisma.series.create({
      data: {
        title: series.title,
        slug: slugify(series.title),
        description: "A message series for the whole congregation.",
        coverImageUrl: `/demo/covers/${series.cover}.svg`,
        published: true,
        memberOnly: series.memberOnly ?? false,
        position: i,
        categoryId: messages.id,
        updatedAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
      },
    });

    for (const [p, part] of series.parts.entries()) {
      const title = `${series.title}, Part ${p + 1}: ${part}`;
      await prisma.video.create({
        data: {
          title,
          slug: slugify(title),
          description: `Message ${p + 1} in the "${series.title}" series.`,
          bunnyVideoId: `demo-${slugify(title)}`,
          bunnyLibraryId: "demo",
          thumbnailUrl: `/demo/covers/${series.cover}.svg`,
          status: "READY",
          published: true,
          position: p,
          seriesId: createdSeries.id,
        },
      });
    }
  }

  // --- Meeting Sharings: a standalone series with a couple of testimony videos ---
  const meetingSeries = await prisma.series.create({
    data: {
      title: "Meeting Sharings",
      slug: "meeting-sharings",
      description: "Testimonies and reflections shared during meetings.",
      coverImageUrl: "/demo/covers/meeting-a.svg",
      published: true,
      position: 0,
    },
  });

  for (const [i, title] of ["Answered Prayer", "A Season of Growth"].entries()) {
    await prisma.video.create({
      data: {
        title,
        slug: slugify(title),
        description: "A member of our congregation shares their story.",
        bunnyVideoId: `demo-${slugify(title)}`,
        bunnyLibraryId: "demo",
        thumbnailUrl: "/demo/covers/meeting-a.svg",
        status: "READY",
        published: true,
        position: i,
        seriesId: meetingSeries.id,
      },
    });
  }

  // --- Resources: a series with a downloadable text file (non-audio download path) ---
  const resourcesSeries = await prisma.series.create({
    data: {
      title: "Resources",
      slug: "resources",
      description: "Study guides and handouts.",
      coverImageUrl: "/demo/covers/resources-a.svg",
      published: true,
      position: 1,
    },
  });

  await prisma.fileAsset.create({
    data: {
      title: "Small Group Study Guide",
      bunnyPath: "demo/resources/study-guide.txt",
      url: "/demo/files/study-guide.txt",
      mimeType: "text/plain",
      published: true,
      seriesId: resourcesSeries.id,
    },
  });

  return { seeded: true };
}

import { PrismaClient } from "@prisma/client";
import { seedDemoContent } from "../src/lib/demo-seed";

// Prefer a dedicated demo database if one's configured, so this never
// touches a real church's production content by accident.
const prisma = new PrismaClient({
  datasourceUrl: process.env.DEMO_DATABASE_URL || process.env.DATABASE_URL,
});

seedDemoContent(prisma)
  .then(({ seeded }) => {
    console.log(seeded ? "Demo content seeded." : "Already seeded, nothing to do.");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

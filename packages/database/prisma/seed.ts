import { PrismaClient, SkillCategoryType } from '@prisma/client';

const prisma = new PrismaClient();

const skillCategories: { name: string; type: SkillCategoryType; icon: string }[] = [
  { name: 'Chant', type: SkillCategoryType.INSTRUMENT, icon: '🎤' },
  { name: 'Guitare', type: SkillCategoryType.INSTRUMENT, icon: '🎸' },
  { name: 'Basse', type: SkillCategoryType.INSTRUMENT, icon: '🎸' },
  { name: 'Piano', type: SkillCategoryType.INSTRUMENT, icon: '🎹' },
  { name: 'Batterie', type: SkillCategoryType.INSTRUMENT, icon: '🥁' },
  { name: 'Son', type: SkillCategoryType.TECHNICAL, icon: '🔊' },
  { name: 'Éclairage', type: SkillCategoryType.TECHNICAL, icon: '💡' },
  { name: 'Production', type: SkillCategoryType.TECHNICAL, icon: '🎚️' },
  { name: 'Vidéo', type: SkillCategoryType.TECHNICAL, icon: '🎥' },
];

async function main() {
  for (const category of skillCategories) {
    await prisma.skillCategory.upsert({
      where: { name: category.name },
      update: { type: category.type, icon: category.icon },
      create: category,
    });
  }
  console.log(`Seeded ${skillCategories.length} skill categories.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

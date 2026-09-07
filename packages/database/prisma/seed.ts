import { PrismaClient, SkillCategoryType } from '@prisma/client';

const prisma = new PrismaClient();

const skillCategories: { name: string; type: SkillCategoryType; icon: string }[] = [
  { name: 'Voz', type: SkillCategoryType.INSTRUMENT, icon: '🎤' },
  { name: 'Guitarra', type: SkillCategoryType.INSTRUMENT, icon: '🎸' },
  { name: 'Bajo', type: SkillCategoryType.INSTRUMENT, icon: '🎸' },
  { name: 'Piano', type: SkillCategoryType.INSTRUMENT, icon: '🎹' },
  { name: 'Batería', type: SkillCategoryType.INSTRUMENT, icon: '🥁' },
  { name: 'Sonido', type: SkillCategoryType.TECHNICAL, icon: '🔊' },
  { name: 'Iluminación', type: SkillCategoryType.TECHNICAL, icon: '💡' },
  { name: 'Producción', type: SkillCategoryType.TECHNICAL, icon: '🎚️' },
  { name: 'Video', type: SkillCategoryType.TECHNICAL, icon: '🎥' },
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

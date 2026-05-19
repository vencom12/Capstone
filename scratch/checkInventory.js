const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const inventory = await prisma.inventory.findMany();
  console.log("INVENTORY IN DATABASE:");
  inventory.forEach(i => {
    console.log(`- ID: ${i.id}, Item: ${i.item}, Count: ${i.count}, Unit: ${i.unit}`);
  });
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());

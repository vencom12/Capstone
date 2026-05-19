const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const products = await prisma.product.findMany();
  console.log("PRODUCTS IN DATABASE:");
  products.forEach(p => {
    console.log(`- ID: ${p.id}, Name: ${p.name}, Count: ${p.count}, Reserved: ${p.reservedCount}, Price: ${p.price}`);
    console.log(`  Recipe: ${JSON.stringify(p.recipe)}`);
  });
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());

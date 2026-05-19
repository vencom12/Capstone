const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const p = await prisma.product.create({
    data: {
      name: "Out of Stock Hoodie",
      price: 45.00,
      tag: "Hoodies",
      count: 0,
      reservedCount: 0,
      description: "Test out of stock hoodie",
      imageUrl: "https://via.placeholder.com/200"
    }
  });
  console.log("Created product:", p);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());

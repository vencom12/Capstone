const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.inventory.findFirst()
  .then(r => {
    if (r) {
      console.log('Inventory fields:', Object.keys(r));
      console.log('supplierUnitCost present:', 'supplierUnitCost' in r);
    } else {
      console.log('No inventory records yet — querying schema...');
      // Check if column exists via raw query
      return p.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_name = 'Inventory' AND column_name = 'supplierUnitCost'`
        .then(res => console.log('Column check result:', res));
    }
  })
  .catch(e => console.error('Error:', e.message))
  .finally(() => p.$disconnect());

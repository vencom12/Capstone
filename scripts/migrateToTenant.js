const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Starting data migration to Legacy Tenant...');
    
    // 1. Create the Legacy Tenant
    let legacyTenant = await prisma.tenant.findFirst({
        where: { name: 'Stitch-Opt Legacy' }
    });
    
    if (!legacyTenant) {
        legacyTenant = await prisma.tenant.create({
            data: {
                name: 'Stitch-Opt Legacy',
                subdomain: 'legacy',
                subscriptionTier: 'enterprise'
            }
        });
        console.log(`Created Legacy Tenant: ${legacyTenant.id}`);
    } else {
        console.log(`Legacy Tenant already exists: ${legacyTenant.id}`);
    }
    
    const tenantId = legacyTenant.id;
    
    // 2. Migrate all entities
    const entitiesToUpdate = [
        'user',
        'product',
        'order',
        'inventory',
        'machine',
        'globalAuditLog',
        'transaction',
        'receipt',
        'inventoryLog',
        'siteTraffic',
        'declinedRecommendation'
    ];
    
    for (const entity of entitiesToUpdate) {
        try {
            const result = await prisma[entity].updateMany({
                where: { tenantId: null },
                data: { tenantId }
            });
            console.log(`Migrated ${result.count} records in ${entity}`);
        } catch (error) {
            console.error(`Failed to migrate ${entity}:`, error.message);
        }
    }
    
    // System Settings - specific logic because it's a unique default ID
    try {
        const settings = await prisma.systemSettings.findUnique({
            where: { id: 'global' }
        });
        if (settings && !settings.tenantId) {
            await prisma.systemSettings.update({
                where: { id: 'global' },
                data: { tenantId }
            });
            console.log(`Migrated SystemSettings.`);
        }
    } catch (e) {
        console.error('Failed to migrate SystemSettings:', e.message);
    }
    
    console.log('Migration completed safely.');
}

main()
  .catch(e => {
      console.error(e);
      process.exit(1);
  })
  .finally(async () => {
      await prisma.$disconnect();
  });

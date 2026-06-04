const { PrismaClient } = require('@prisma/client');
const tenantStorage = require('./tenantContext');

const basePrisma = new PrismaClient();

const prismaWithTenant = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const tenantId = tenantStorage.getStore();
        
        // Skip models that are not tenant isolated
        if (!tenantId || model === 'Tenant') {
          return query(args);
        }

        const readWriteMethods = ['findUnique', 'findFirst', 'findMany', 'update', 'updateMany', 'delete', 'deleteMany', 'count', 'aggregate', 'groupBy'];
        
        if (readWriteMethods.includes(operation)) {
          args.where = { ...args.where, tenantId };
          
          if (operation === 'findUnique') {
            return basePrisma[model].findFirst(args);
          }
          
          if (operation === 'update' || operation === 'delete') {
             const existing = await basePrisma[model].findFirst({ where: args.where });
             if (!existing) throw new Error(`${model} not found or unauthorized for tenant`);
             
             args.where = { id: existing.id }; 
             return query(args);
          }
        }
        
        if (operation === 'create') {
          args.data = { ...args.data, tenantId };
        }
        if (operation === 'createMany') {
          if (Array.isArray(args.data)) {
            args.data = args.data.map(d => ({ ...d, tenantId }));
          } else {
            args.data.tenantId = tenantId;
          }
        }
        
        return query(args);
      }
    }
  }
});

let prisma;
if (process.env.NODE_ENV === 'production') {
  prisma = prismaWithTenant;
} else {
  if (!global.prisma) {
    global.prisma = prismaWithTenant;
  }
  prisma = global.prisma;
}

module.exports = prisma;

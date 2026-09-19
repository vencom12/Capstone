const { PrismaClient } = require('@prisma/client');
const tenantStorage = require('./tenantContext');

const basePrisma = new PrismaClient();

const prismaWithTenant = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const tenantId = tenantStorage.getStore();
        
        // Skip models that are not tenant isolated or when tenant context is not set
        if (!tenantId || model === 'Tenant') {
          return query(args);
        }

        const tenantWhere = {
          OR: [
            { tenantId: tenantId },
            { tenantId: null }
          ]
        };

        if (operation === 'findUnique') {
          return basePrisma[model].findFirst({
            ...args,
            where: {
              AND: [
                args.where || {},
                tenantWhere
              ]
            }
          });
        }

        if (['findFirst', 'findMany', 'count', 'aggregate', 'groupBy'].includes(operation)) {
          args.where = {
            AND: [
              args.where || {},
              tenantWhere
            ]
          };
          return query(args);
        }

        if (operation === 'update' || operation === 'delete') {
          const existing = await basePrisma[model].findFirst({
            where: {
              AND: [
                args.where || {},
                tenantWhere
              ]
            }
          });
          if (!existing) {
            throw new Error(`${model} not found or unauthorized for tenant`);
          }
          args.where = { id: existing.id };
          return query(args);
        }

        if (operation === 'updateMany' || operation === 'deleteMany') {
          args.where = {
            AND: [
              args.where || {},
              tenantWhere
            ]
          };
          return query(args);
        }

        if (operation === 'create') {
          if (args.data && !args.data.tenantId) {
            args.data = { tenantId, ...args.data };
          }
          return query(args);
        }

        if (operation === 'createMany') {
          if (Array.isArray(args.data)) {
            args.data = args.data.map(d => ({ tenantId, ...d }));
          } else if (args.data && !args.data.tenantId) {
            args.data.tenantId = tenantId;
          }
          return query(args);
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

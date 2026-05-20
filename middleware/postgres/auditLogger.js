const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Global Audit Logger Middleware
 * Intercepts mutative requests and writes diff payloads to the database.
 * 
 * Usage:
 * router.post('/some-route', auditLogger('EntityName', 'ACTION_NAME'), controllerFunction)
 */
const auditLogger = (entity, actionName) => {
  return async (req, res, next) => {
    // We only want to log successful mutations, so we hook into res.send/res.json
    const originalSend = res.send;
    const originalJson = res.json;

    // Capture the original body to calculate a diff later (for updates)
    // Note: For a true diff, you'd fetch the DB record first. 
    // For this lightweight version, we store the req.body as the diff, 
    // or you can pass custom diffs via res.locals.auditDiff in your controllers.
    
    res.json = function (body) {
      res.locals.responseBody = body;
      return originalJson.call(this, body);
    };

    res.send = function (body) {
      res.locals.responseBody = body;
      return originalSend.call(this, body);
    };

    // Wait for the request to finish
    res.on('finish', async () => {
      // Only log on successful status codes (2xx)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          // Extract user info (assuming authentication middleware sets req.user)
          const userId = req.user?.id || req.user?.userId || null;
          const userRole = req.user?.role || 'system';
          
          // Use a custom diff if the controller provided one, otherwise fallback to req.body (sanitized)
          let diff = res.locals.auditDiff || req.body || {};
          
          // Remove sensitive fields from diff just in case
          const sanitizedDiff = { ...diff };
          delete sanitizedDiff.password;
          delete sanitizedDiff.token;

          await prisma.globalAuditLog.create({
            data: {
              userId: userId,
              userRole: userRole,
              action: actionName,
              entity: entity,
              // Attempt to extract the entity ID from params, body, or response
              entityId: req.params.id || req.body.id || (res.locals.responseBody && res.locals.responseBody.id) || null,
              ipAddress: req.ip || req.headers['x-forwarded-for'] || null,
              diff: sanitizedDiff
            }
          });
          console.log(`[Audit] Logged action: ${actionName} on ${entity} by user: ${userId}`);
        } catch (error) {
          console.error('[Audit Logger Error]', error);
        }
      }
    });

    next();
  };
};

module.exports = auditLogger;

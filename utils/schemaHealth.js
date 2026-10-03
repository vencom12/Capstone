const fs = require('fs');
const path = require('path');
const prisma = require('./prisma');

// Schema drift guard.
//
// `prisma db push` runs in the Render build command, so the database normally
// matches prisma/schema.prisma. This module exists to catch the case where a
// deploy produced a Prisma Client that expects columns or tables the database
// does not have. That mismatch is what made every admin dashboard query fail
// with P2022 while /api/health still reported "Connected".
//
// A bare `SELECT 1` cannot detect this: it proves the socket is open, not that
// the schema matches. This compares the declared models/fields in
// schema.prisma against information_schema.

const SCHEMA_PATH = path.join(__dirname, '..', 'prisma', 'schema.prisma');
const CACHE_TTL_MS = 30 * 1000;

let cachedExpectations = null;
let cachedResult = null;
let cachedAt = 0;

// Field types that Prisma stores as a real database column when they are not
// a relation. Anything named after a model in schema.prisma is a relation and
// therefore has no column of its own.
const parseSchemaExpectations = () => {
    const raw = fs.readFileSync(SCHEMA_PATH, 'utf8');

    const modelNames = new Set(
        [...raw.matchAll(/^model\s+(\w+)\s*\{/gm)].map(m => m[1])
    );

    const expectations = {};

    for (const match of raw.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
        const modelName = match[1];
        const body = match[2];
        const columns = [];

        for (const rawLine of body.split('\n')) {
            const line = rawLine.trim();

            // Skip blank lines, comments and block attributes (@@index, @@id...)
            if (!line || line.startsWith('//') || line.startsWith('@@')) continue;

            // "fieldName  Type?  @attributes..."
            const tokens = line.split(/\s+/);
            if (tokens.length < 2) continue;

            const fieldName = tokens[0];
            // Strip optionality and list markers: "Order?" / "Product[]" / "String[]?"
            const typeToken = tokens[1].replace(/\?$/, '').replace(/\[\]$/, '');

            // A field whose type is a model is a relation, not a column.
            // This keeps "orders Order[]" and "user User?" out of the column list
            // while keeping "role Role" (an enum) and "tags String[]" in it.
            if (modelNames.has(typeToken)) continue;

            columns.push(fieldName);
        }

        expectations[modelName] = columns;
    }

    return expectations;
};

const getExpectations = () => {
    if (!cachedExpectations) {
        cachedExpectations = parseSchemaExpectations();
    }
    return cachedExpectations;
};

const checkSchemaSync = async () => {
    const now = Date.now();
    if (cachedResult && (now - cachedAt) < CACHE_TTL_MS) {
        return cachedResult;
    }

    let expectations;
    try {
        expectations = getExpectations();
    } catch (err) {
        // Never fail the health check just because the schema file is unreadable.
        console.warn('[SCHEMA] Could not read prisma/schema.prisma, skipping drift check:', err.message);
        return { checked: false, ok: true, missingTables: [], missingColumns: [] };
    }

    const rows = await prisma.$queryRawUnsafe(`
        SELECT c.table_name, c.column_name
        FROM information_schema.columns c
        JOIN information_schema.tables t
          ON t.table_name = c.table_name AND t.table_schema = c.table_schema
        WHERE c.table_schema = 'public'
    `);

    const dbTables = new Map();
    for (const row of rows) {
        if (!dbTables.has(row.table_name)) dbTables.set(row.table_name, new Set());
        dbTables.get(row.table_name).add(row.column_name);
    }

    const missingTables = [];
    const missingColumns = [];

    for (const [modelName, columns] of Object.entries(expectations)) {
        const actual = dbTables.get(modelName);

        if (!actual) {
            missingTables.push(modelName);
            continue;
        }

        for (const column of columns) {
            if (!actual.has(column)) {
                missingColumns.push(`${modelName}.${column}`);
            }
        }
    }

    const result = {
        checked: true,
        ok: missingTables.length === 0 && missingColumns.length === 0,
        missingTables,
        missingColumns
    };

    if (!result.ok) {
        console.error('[SCHEMA] DATABASE IS OUT OF SYNC WITH prisma/schema.prisma');
        if (missingTables.length) console.error(`[SCHEMA] Missing tables: ${missingTables.join(', ')}`);
        if (missingColumns.length) console.error(`[SCHEMA] Missing columns: ${missingColumns.join(', ')}`);
        console.error('[SCHEMA] Fix by running: npx prisma db push');
    }

    cachedResult = result;
    cachedAt = now;
    return result;
};

const invalidateCache = () => {
    cachedResult = null;
    cachedAt = 0;
};

module.exports = { checkSchemaSync, invalidateCache };
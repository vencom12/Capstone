const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function checkUsers() {
  try {
    await client.connect();
    console.log('Connected to PostgreSQL successfully!');
    const res = await client.query('SELECT id, email, username, role FROM "User"');
    console.log('Users in database:', res.rows);
    await client.end();
  } catch (err) {
    console.error('Error fetching users:', err.stack);
  }
}

checkUsers();

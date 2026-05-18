import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import dotenv from 'dotenv';

// Load environment variables (.env) so we connect to the correct database (Supabase)
beforeAll(() => {
  dotenv.config();
});

describe('Stitch-Opt API & Supabase Integration Tests', () => {
  
  it('GET /api/health - Verify Server is Online & Database Status', async () => {
    // Queries the running local Express server (port 5001)
    const response = await request('http://localhost:5001')
      .get('/api/health')
      .timeout(5000);
      
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'ok');
    
    // Crucial check: Verifies the database status is 'Connected' (meaning backend successfully connected to Supabase!)
    expect(response.body).toHaveProperty('database', 'Connected');
    expect(response.body).toHaveProperty('dbType', 'postgres');
  });

  it('Direct DB Check - Verify Prisma Can Query Supabase Schema', async () => {
    // Import our database client directly to verify the local testing process can read tables
    const prisma = require('../utils/prisma');
    
    // We attempt to count users in your Supabase database
    const userCount = await prisma.user.count();
    
    // The query should complete successfully without throwing an error
    expect(typeof userCount).toBe('number');
    expect(userCount).toBeGreaterThanOrEqual(0);
    
    console.log(`[TEST] Successfully queried Supabase! Found ${userCount} users registered.`);
  });
});

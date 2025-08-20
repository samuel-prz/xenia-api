import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // if you are using SSL, uncomment the following line
  // and make sure to set the environment variable DATABASE_URL with the correct SSL configuration
  // ssl: { rejectUnauthorized: false },
});

// Initialize the database connection with drizzle ORM
export const db = drizzle(pool);

// simple ping function to check if the database is up
export async function pingDb() {
  const client = await pool.connect();
  try {
    await client.query('select 1');
    return true;
  } finally {
    client.release();
  }
}

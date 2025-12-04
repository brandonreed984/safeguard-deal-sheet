// db.js - Database initialization and schema
import pg from 'pg';
const { Pool } = pg;

// Use PostgreSQL if DATABASE_URL is set (production), otherwise SQLite for local dev
const DATABASE_URL = process.env.DATABASE_URL;

let db;

if (DATABASE_URL) {
  // PostgreSQL for production (Railway)
  console.log('📊 Connecting to PostgreSQL...');
  
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  // Test connection
  try {
    await pool.query('SELECT NOW()');
    console.log('✅ PostgreSQL connected');
  } catch (err) {
    console.error('❌ PostgreSQL connection failed:', err.message);
    throw err;
  }

  // Create deals table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS deals (
      id SERIAL PRIMARY KEY,
      "loanNumber" TEXT UNIQUE NOT NULL,
      amount TEXT,
      "rateType" TEXT,
      term TEXT,
      "monthlyReturn" TEXT,
      ltv TEXT,
      address TEXT NOT NULL,
      appraisal TEXT,
      rent TEXT,
      sqft TEXT,
      "bedsBaths" TEXT,
      "marketLocation" TEXT,
      "marketOverview" TEXT,
      "dealInformation" TEXT,
      "heroImage" TEXT,
      "int1Image" TEXT,
      "int2Image" TEXT,
      "int3Image" TEXT,
      "int4Image" TEXT,
      "attachedPdf" TEXT,
      "pdfPath" TEXT,
      "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_address ON deals(address);
    CREATE INDEX IF NOT EXISTS idx_loanNumber ON deals("loanNumber");
  `);

  db = {
    pool: pool,
    prepare: (sql) => {
      return {
        run: async (...params) => {
          const result = await pool.query(sql, params);
          return { lastInsertRowid: result.rows[0]?.id, changes: result.rowCount };
        },
        get: async (...params) => {
          const result = await pool.query(sql, params);
          return result.rows[0];
        },
        all: async (...params) => {
          const result = await pool.query(sql, params);
          return result.rows;
        }
      };
    }
  };

  console.log('✅ PostgreSQL Database initialized');
} else {
  // SQLite for local development
  const Database = (await import('better-sqlite3')).default;
  const path = await import('path');
  const { fileURLToPath } = await import('url');
  
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  
  const sqlite = new Database(path.join(__dirname, 'deals.db'));
  
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS deals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loanNumber TEXT UNIQUE NOT NULL,
      amount TEXT,
      rateType TEXT,
      term TEXT,
      monthlyReturn TEXT,
      ltv TEXT,
      address TEXT NOT NULL,
      appraisal TEXT,
      rent TEXT,
      sqft TEXT,
      bedsBaths TEXT,
      marketLocation TEXT,
      marketOverview TEXT,
      dealInformation TEXT,
      heroImage TEXT,
      int1Image TEXT,
      int2Image TEXT,
      int3Image TEXT,
      int4Image TEXT,
      attachedPdf TEXT,
      pdfPath TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_address ON deals(address);
    CREATE INDEX IF NOT EXISTS idx_loanNumber ON deals(loanNumber);
  `);
  
  db = sqlite;
  console.log('✅ SQLite Database initialized (local dev)');
}

export default db;

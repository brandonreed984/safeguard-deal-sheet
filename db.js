// db.js - Database initialization and schema
import pkg from 'pg';
const { Pool } = pkg;

// Use PostgreSQL if DATABASE_URL is set (production), otherwise SQLite for local dev
// Only use the hardcoded Railway URL if we're actually on Railway (check for RAILWAY_ENVIRONMENT)
const DATABASE_URL = process.env.DATABASE_URL || 
  (process.env.RAILWAY_ENVIRONMENT ? 'postgresql://postgres:aqDDwRuguUFygnItdhWQYISTBYSrWHkB@postgres.railway.internal:5432/railway' : null);

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

    // Create portfolio_reviews table
    console.log('Creating portfolio_reviews table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS portfolio_reviews (
        id SERIAL PRIMARY KEY,
        "investorName" TEXT NOT NULL,
        "loansData" TEXT NOT NULL,
        "currentInvestmentTotal" DECIMAL(15,2),
        "lifetimeInvestmentTotal" DECIMAL(15,2),
        "lifetimeInterestPaid" DECIMAL(15,2),
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_investorName ON portfolio_reviews("investorName");
    `);
    console.log('✅ portfolio_reviews table ready');

    // Export the raw pool for PostgreSQL
    db = pool;
    db.isPostgres = true;

    console.log('✅ PostgreSQL Database initialized');
  } catch (err) {
    console.error('❌ PostgreSQL connection failed:', err.message);
    throw err;
  }
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

  // Create portfolio_reviews table for SQLite
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS portfolio_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      investorName TEXT NOT NULL,
      loansData TEXT NOT NULL,
      currentInvestmentTotal REAL,
      lifetimeInvestmentTotal REAL,
      lifetimeInterestPaid REAL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_investorName ON portfolio_reviews(investorName);
  `);
  
  db = sqlite;
  console.log('✅ SQLite Database initialized (local dev)');
}

export default db;

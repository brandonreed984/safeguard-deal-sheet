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
      )
    `);

    // Add archived column if it doesn't exist (migration for existing tables)
    try {
      const checkCol = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='deals' AND column_name='archived'
      `);
      
      if (checkCol.rows.length === 0) {
        await pool.query(`ALTER TABLE deals ADD COLUMN archived BOOLEAN DEFAULT FALSE`);
        console.log('✅ Deals table migration: archived column added');
      } else {
        console.log('✅ Deals table: archived column already exists');
      }
    } catch (err) {
      console.log('Deals archived column migration skipped:', err.message);
    }

    // Add clientName column if it doesn't exist (migration for engagement agreements)
    try {
      const checkCol = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='deals' AND column_name='clientName'
      `);
      
      if (checkCol.rows.length === 0) {
        await pool.query(`ALTER TABLE deals ADD COLUMN "clientName" TEXT`);
        console.log('✅ Deals table migration: clientName column added');
      } else {
        console.log('✅ Deals table: clientName column already exists');
      }
    } catch (err) {
      console.log('Deals clientName column migration skipped:', err.message);
    }

    // Add lendingEntity column if it doesn't exist (migration for engagement agreements)
    try {
      const checkCol = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='deals' AND column_name='lendingEntity'
      `);
      
      if (checkCol.rows.length === 0) {
        await pool.query(`ALTER TABLE deals ADD COLUMN "lendingEntity" TEXT`);
        console.log('✅ Deals table migration: lendingEntity column added');
      } else {
        console.log('✅ Deals table: lendingEntity column already exists');
      }
    } catch (err) {
      console.log('Deals lendingEntity column migration skipped:', err.message);
    }

    // Add clientAddress column if it doesn't exist (migration for engagement agreements)
    try {
      const checkCol = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='deals' AND column_name='clientAddress'
      `);
      
      if (checkCol.rows.length === 0) {
        await pool.query(`ALTER TABLE deals ADD COLUMN "clientAddress" TEXT`);
        console.log('✅ Deals table migration: clientAddress column added');
      } else {
        console.log('✅ Deals table: clientAddress column already exists');
      }
    } catch (err) {
      console.log('Deals clientAddress column migration skipped:', err.message);
    }

    // Add borrowerName column if it doesn't exist
    try {
      const checkCol = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='deals' AND column_name='borrowerName'
      `);
      
      if (checkCol.rows.length === 0) {
        await pool.query(`ALTER TABLE deals ADD COLUMN "borrowerName" TEXT`);
        console.log('✅ Deals table migration: borrowerName column added');
      } else {
        console.log('✅ Deals table: borrowerName column already exists');
      }
    } catch (err) {
      console.log('Deals borrowerName column migration skipped:', err.message);
    }

    // Add borrowerAddress column if it doesn't exist
    try {
      const checkCol = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='deals' AND column_name='borrowerAddress'
      `);
      
      if (checkCol.rows.length === 0) {
        await pool.query(`ALTER TABLE deals ADD COLUMN "borrowerAddress" TEXT`);
        console.log('✅ Deals table migration: borrowerAddress column added');
      } else {
        console.log('✅ Deals table: borrowerAddress column already exists');
      }
    } catch (err) {
      console.log('Deals borrowerAddress column migration skipped:', err.message);
    }

    // Create indexes after column migration
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_address ON deals(address);
      CREATE INDEX IF NOT EXISTS idx_loanNumber ON deals("loanNumber");
      CREATE INDEX IF NOT EXISTS idx_archived ON deals(archived);
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
      )
    `);

    // Add archived column if it doesn't exist (migration for existing tables)
    try {
      const checkCol = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='portfolio_reviews' AND column_name='archived'
      `);
      
      if (checkCol.rows.length === 0) {
        await pool.query(`ALTER TABLE portfolio_reviews ADD COLUMN archived BOOLEAN DEFAULT FALSE`);
        console.log('✅ Portfolio_reviews table migration: archived column added');
      } else {
        console.log('✅ Portfolio_reviews table: archived column already exists');
      }
    } catch (err) {
      console.log('Portfolio archived column migration skipped:', err.message);
    }

    // Create indexes after column migration
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_investorName ON portfolio_reviews("investorName");
      CREATE INDEX IF NOT EXISTS idx_portfolio_archived ON portfolio_reviews(archived);
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
      clientName TEXT,
      lendingEntity TEXT,
      clientAddress TEXT,
      borrowerName TEXT,
      borrowerAddress TEXT,
      archived INTEGER DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_address ON deals(address);
    CREATE INDEX IF NOT EXISTS idx_loanNumber ON deals(loanNumber);
    CREATE INDEX IF NOT EXISTS idx_archived ON deals(archived);
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
      archived INTEGER DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_investorName ON portfolio_reviews(investorName);
    CREATE INDEX IF NOT EXISTS idx_portfolio_archived ON portfolio_reviews(archived);
  `);
  
  db = sqlite;
  console.log('✅ SQLite Database initialized (local dev)');
}

export default db;

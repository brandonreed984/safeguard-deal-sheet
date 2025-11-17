// db.js - Database initialization and schema
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database(path.join(__dirname, 'deals.db'));

// Create deals table
db.exec(`
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

console.log('✅ Database initialized');

export default db;

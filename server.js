// server.js
console.log('Starting server initialization...');
import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import db from "./db.js";
console.log('Imports successful...');

dotenv.config();

console.log('🔍 Environment check:');
console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);
console.log('PORT:', process.env.PORT || 5000);
console.log('db.pool exists:', !!db.pool);

const app = express();
app.use(cors());
app.use(express.static("public"));
app.use(express.json({ limit: '50mb' }));

// === Storage setup ===
const STORAGE_DIR = process.env.STORAGE_DIR || path.join(process.cwd(), "storage");
if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });

const upload = multer({ storage: multer.memoryStorage() });

// === Upload endpoint ===
app.post("/api/pdfs", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    let meta = {};
    try { meta = JSON.parse(req.body.meta || "{}"); } catch {}

    const safeName = (req.file.originalname || `deal_${Date.now()}.pdf`)
      .replace(/[^a-zA-Z0-9._-]/g, "_");
    const folder = meta.loanNumber
      ? meta.loanNumber.toString().replace(/[^a-zA-Z0-9._-]/g, "_")
      : "unknown";
    const year = new Date().getFullYear().toString();

    const outDir = path.join(STORAGE_DIR, year, folder);
    fs.mkdirSync(outDir, { recursive: true });

    const filePath = path.join(outDir, safeName);
    fs.writeFileSync(filePath, req.file.buffer);

    res.json({ ok: true, path: filePath });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// === Index endpoint ===
app.get("/api/pdfs", async (req, res) => {
  const listFiles = (dir) => {
    let results = [];
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) results = results.concat(listFiles(filePath));
      else if (file.endsWith(".pdf")) results.push(filePath);
    }
    return results;
  };

  try {
    const all = listFiles(STORAGE_DIR);
    const sorted = all.sort((a, b) => fs.statSync(b).mtime - fs.statSync(a).mtime);
    res.json(sorted.slice(0, 50)); // last 50
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// === Database Endpoints ===

// Create or update a deal
app.post("/api/deals", async (req, res) => {
  try {
    const data = req.body;
    console.log('📝 Creating deal:', data.loanNumber, data.address);
    
    if (db.pool) {
      // PostgreSQL
      console.log('Using PostgreSQL');
      const queryText = `INSERT INTO deals (
        "loanNumber", amount, "rateType", term, "monthlyReturn", ltv,
        address, appraisal, rent, sqft, "bedsBaths", "marketLocation",
        "marketOverview", "dealInformation", "heroImage", "int1Image", "int2Image",
        "int3Image", "int4Image", "attachedPdf"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING id`;
      
      const queryValues = [
        data.loanNumber, data.amount, data.rateType, data.term, data.monthlyReturn, data.ltv,
        data.address, data.appraisal, data.rent, data.sqft, data.bedsBaths, data.marketLocation,
        data.marketOverview, data.dealInformation, data.hero, data.int1, data.int2,
        data.int3, data.int4, data.attachedPdf
      ];
      
      const result = await db.pool.query(queryText, queryValues);
      console.log('✅ Deal created with ID:', result.rows[0].id);
      res.json({ ok: true, id: result.rows[0].id });
    } else {
      // SQLite
      const stmt = db.prepare(`
        INSERT INTO deals (
          loanNumber, amount, rateType, term, monthlyReturn, ltv,
          address, appraisal, rent, sqft, bedsBaths, marketLocation,
          marketOverview, dealInformation, heroImage, int1Image, int2Image,
          int3Image, int4Image, attachedPdf
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(
        data.loanNumber, data.amount, data.rateType, data.term, data.monthlyReturn, data.ltv,
        data.address, data.appraisal, data.rent, data.sqft, data.bedsBaths, data.marketLocation,
        data.marketOverview, data.dealInformation, data.hero, data.int1, data.int2,
        data.int3, data.int4, data.attachedPdf
      );
      res.json({ ok: true, id: result.lastInsertRowid });
    }
  } catch (e) {
    console.error('❌ Error creating deal:', e.message);
    console.error('Stack:', e.stack);
    res.status(500).json({ error: e.message });
  }
});

// Get all deals (searchable by address)
app.get("/api/deals", async (req, res) => {
  try {
    const search = req.query.search || '';
    let deals;
    
    if (db.pool) {
      // PostgreSQL
      if (search) {
        const result = await db.pool.query(
          'SELECT * FROM deals WHERE address ILIKE $1 OR "loanNumber" ILIKE $2 ORDER BY "updatedAt" DESC',
          [`%${search}%`, `%${search}%`]
        );
        deals = result.rows;
      } else {
        const result = await db.pool.query('SELECT * FROM deals ORDER BY "updatedAt" DESC');
        deals = result.rows;
      }
    } else {
      // SQLite
      if (search) {
        const stmt = db.prepare('SELECT * FROM deals WHERE address LIKE ? OR loanNumber LIKE ? ORDER BY updatedAt DESC');
        deals = stmt.all(`%${search}%`, `%${search}%`);
      } else {
        deals = db.prepare('SELECT * FROM deals ORDER BY updatedAt DESC').all();
      }
    }
    res.json(deals);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Get a single deal by ID
app.get("/api/deals/:id", async (req, res) => {
  try {
    let deal;
    
    if (db.pool) {
      // PostgreSQL
      const result = await db.pool.query(
        'SELECT * FROM deals WHERE id = $1',
        [req.params.id]
      );
      deal = result.rows[0];
    } else {
      // SQLite
      deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.id);
    }
    
    if (!deal) return res.status(404).json({ error: 'Deal not found' });
    res.json(deal);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Update a deal
app.put("/api/deals/:id", async (req, res) => {
  try {
    const data = req.body;
    
    if (db.pool) {
      // PostgreSQL
      await db.pool.query(
        `UPDATE deals SET
          "loanNumber"=$2, amount=$3, "rateType"=$4, term=$5, "monthlyReturn"=$6, ltv=$7,
          address=$8, appraisal=$9, rent=$10, sqft=$11, "bedsBaths"=$12, "marketLocation"=$13,
          "marketOverview"=$14, "dealInformation"=$15, "heroImage"=$16, "int1Image"=$17, "int2Image"=$18,
          "int3Image"=$19, "int4Image"=$20, "attachedPdf"=$21, "updatedAt"=CURRENT_TIMESTAMP
        WHERE id = $1`,
        [
          req.params.id,
          data.loanNumber, data.amount, data.rateType, data.term, data.monthlyReturn, data.ltv,
          data.address, data.appraisal, data.rent, data.sqft, data.bedsBaths, data.marketLocation,
          data.marketOverview, data.dealInformation, data.hero, data.int1, data.int2,
          data.int3, data.int4, data.attachedPdf
        ]
      );
    } else {
      // SQLite
      const stmt = db.prepare(`
        UPDATE deals SET
          loanNumber=?, amount=?, rateType=?, term=?, monthlyReturn=?, ltv=?,
          address=?, appraisal=?, rent=?, sqft=?, bedsBaths=?, marketLocation=?,
          marketOverview=?, dealInformation=?, heroImage=?, int1Image=?, int2Image=?,
          int3Image=?, int4Image=?, attachedPdf=?, updatedAt=CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      stmt.run(
        data.loanNumber, data.amount, data.rateType, data.term, data.monthlyReturn, data.ltv,
        data.address, data.appraisal, data.rent, data.sqft, data.bedsBaths, data.marketLocation,
        data.marketOverview, data.dealInformation, data.hero, data.int1, data.int2,
        data.int3, data.int4, data.attachedPdf, req.params.id
      );
    }
    
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Delete a deal
app.delete("/api/deals/:id", async (req, res) => {
  try {
    if (db.pool) {
      // PostgreSQL
      await db.pool.query(
        'DELETE FROM deals WHERE id = $1',
        [req.params.id]
      );
    } else {
      // SQLite
      db.prepare('DELETE FROM deals WHERE id = ?').run(req.params.id);
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// === Health check ===
app.get("/health", (_, res) => res.json({ ok: true }));

// === Start server ===
console.log('Attempting to start server...');
const PORT = process.env.PORT || 5050;
try {
    app.listen(PORT, () => {
        console.log(`✅ Server running at http://localhost:${PORT}`);
    });
} catch (error) {
    console.error('Failed to start server:', error);
}

// server.js
console.log('Starting server initialization...');
import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import pg from 'pg';
console.log('Imports successful...');

dotenv.config();

console.log('🔍 Environment check:');
console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);
console.log('DATABASE_URL value:', process.env.DATABASE_URL ? 'SET (hidden)' : 'NOT SET');
console.log('All env keys:', Object.keys(process.env).filter(k => k.includes('DATA') || k.includes('PG')));
console.log('PORT:', process.env.PORT || 5000);

// Import db - it will have the PostgreSQL pool or SQLite connection
import db from "./db.js";
console.log('db loaded for initialization');

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

// === Debug endpoint ===
app.get("/api/debug", async (req, res) => {
  res.json({
    hasDATABASE_URL: !!process.env.DATABASE_URL,
    isPostgres: !!db.isPostgres,
    nodeVersion: process.version,
    dbType: db.isPostgres ? 'PostgreSQL' : 'SQLite'
  });
});

// === Health check endpoint ===
app.get("/api/health", (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    database: db.isPostgres ? 'postgresql' : 'sqlite',
    version: '1.0.0'
  });
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

// === PDF Generation and Merging ===
app.post("/api/generate-pdf/:id", async (req, res) => {
  try {
    let puppeteer, PDFDocument;
    try {
      const puppeteerModule = await import('puppeteer');
      puppeteer = puppeteerModule.default;
      const pdfLibModule = await import('pdf-lib');
      PDFDocument = pdfLibModule.PDFDocument;
    } catch (importErr) {
      console.error('Failed to import PDF libraries:', importErr);
      return res.status(500).json({ error: 'PDF generation not available: ' + importErr.message });
    }
    
    // Get the deal data
    let deal;
    if (db.isPostgres) {
      const result = await db.query('SELECT * FROM deals WHERE id = $1', [req.params.id]);
      deal = result.rows[0];
    } else {
      deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.id);
    }
    
    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }
    
    // Debug logging
    console.log('🎨 PDF Generation for deal:', deal.id);
    console.log('  - Has heroImage:', !!deal.heroImage);
    console.log('  - Has int1Image:', !!deal.int1Image);
    console.log('  - Has attachedPdf:', !!deal.attachedPdf);
    if (deal.heroImage) {
      console.log('  - heroImage length:', deal.heroImage.length);
      console.log('  - heroImage starts with:', deal.heroImage.substring(0, 50));
    }
    
    // Launch headless browser with Railway-compatible options
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding'
        ],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
      });
    } catch (launchErr) {
      console.error('Failed to launch browser:', launchErr);
      return res.status(500).json({ error: 'Failed to start PDF generator: ' + launchErr.message });
    }
    
    const page = await browser.newPage();
    
    // Build HTML for the deal sheet with proper styling
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
      font-family: Arial, Helvetica, sans-serif; 
      padding: 48px;
      background: white;
      color: #141414;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 2px solid #1E66B4;
    }
    h1 { 
      color: #1E66B4; 
      font-size: 28px;
      margin-bottom: 10px;
    }
    .tagline {
      color: #3C3C3C;
      font-size: 14px;
      font-weight: 700;
    }
    .section {
      margin: 25px 0;
      page-break-inside: avoid;
    }
    .section-title {
      color: #1E66B4;
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid #D2D2D2;
    }
    .info-grid { 
      display: grid; 
      grid-template-columns: repeat(2, 1fr); 
      gap: 12px;
      margin: 15px 0;
    }
    .info-item { 
      padding: 12px; 
      background: #F2F5F8; 
      border-radius: 8px;
      border: 1px solid #D2D2D2;
    }
    .info-label { 
      font-weight: 700; 
      color: #3C3C3C;
      font-size: 11px;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .info-value {
      font-size: 14px;
      color: #141414;
    }
    .text-content {
      padding: 15px;
      background: #F2F5F8;
      border-radius: 8px;
      border: 1px solid #D2D2D2;
      line-height: 1.6;
      font-size: 13px;
    }
    .images { 
      display: grid; 
      grid-template-columns: repeat(2, 1fr); 
      gap: 15px; 
      margin: 20px 0;
    }
    .image-hero {
      grid-column: 1 / -1;
      width: 100%;
      max-height: 400px;
      object-fit: cover;
      border-radius: 12px;
      border: 2px solid #D2D2D2;
    }
    .images img { 
      width: 100%; 
      height: 250px;
      object-fit: cover;
      border-radius: 12px;
      border: 2px solid #D2D2D2;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Deal Sheet</h1>
    <div class="tagline">Private Lending Secured by Real Estate</div>
  </div>

  <div class="section">
    <div class="section-title">LOAN SUMMARY</div>
    <div class="info-grid">
      <div class="info-item"><div class="info-label">Loan #</div><div class="info-value">${deal.loanNumber || 'N/A'}</div></div>
      <div class="info-item"><div class="info-label">Amount</div><div class="info-value">${deal.amount || ''}</div></div>
      <div class="info-item"><div class="info-label">Rate / Type</div><div class="info-value">${deal.rateType || ''}</div></div>
      <div class="info-item"><div class="info-label">Term</div><div class="info-value">${deal.term || ''}</div></div>
      <div class="info-item"><div class="info-label">Monthly Return</div><div class="info-value">${deal.monthlyReturn || ''}</div></div>
      <div class="info-item"><div class="info-label">LTV</div><div class="info-value">${deal.ltv || ''}</div></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">PROPERTY DETAILS</div>
    <div class="info-grid">
      <div class="info-item"><div class="info-label">Address</div><div class="info-value">${deal.address || ''}</div></div>
      <div class="info-item"><div class="info-label">Appraisal</div><div class="info-value">${deal.appraisal || ''}</div></div>
      <div class="info-item"><div class="info-label">Rent</div><div class="info-value">${deal.rent || ''}</div></div>
      <div class="info-item"><div class="info-label">Square Footage</div><div class="info-value">${deal.sqft || ''}</div></div>
      <div class="info-item"><div class="info-label">Beds / Baths</div><div class="info-value">${deal.bedsBaths || ''}</div></div>
    </div>
  </div>

  ${deal.marketLocation ? `
  <div class="section">
    <div class="section-title">MARKET LOCATION</div>
    <div class="text-content">${deal.marketLocation}</div>
  </div>` : ''}

  ${deal.marketOverview ? `
  <div class="section">
    <div class="section-title">MARKET OVERVIEW</div>
    <div class="text-content">${deal.marketOverview}</div>
  </div>` : ''}

  ${deal.dealInformation ? `
  <div class="section">
    <div class="section-title">DEAL INFORMATION</div>
    <div class="text-content">${deal.dealInformation}</div>
  </div>` : ''}

  ${(deal.heroImage || deal.int1Image || deal.int2Image || deal.int3Image || deal.int4Image) ? `
  <div class="section">
    <div class="section-title">PROPERTY PHOTOS</div>
    <div class="images">
      ${deal.heroImage ? `<img src="${deal.heroImage}" class="image-hero" alt="Main Property" />` : ''}
      ${deal.int1Image ? `<img src="${deal.int1Image}" alt="Interior 1" />` : ''}
      ${deal.int2Image ? `<img src="${deal.int2Image}" alt="Interior 2" />` : ''}
      ${deal.int3Image ? `<img src="${deal.int3Image}" alt="Interior 3" />` : ''}
      ${deal.int4Image ? `<img src="${deal.int4Image}" alt="Interior 4" />` : ''}
    </div>
  </div>` : ''}
</body>
</html>`;
    
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const dealSheetPdf = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();
    
    // Create PDF document from the generated PDF
    const pdfDoc = await PDFDocument.create();
    const dealSheetDoc = await PDFDocument.load(dealSheetPdf);
    const dealSheetPages = await pdfDoc.copyPages(dealSheetDoc, dealSheetDoc.getPageIndices());
    dealSheetPages.forEach(page => pdfDoc.addPage(page));
    
    // Merge attached PDFs if any
    if (deal.attachedPdf) {
      try {
        console.log('📎 Attached PDF data exists, length:', deal.attachedPdf.length);
        console.log('📎 First 100 chars:', deal.attachedPdf.substring(0, 100));
        
        const attachedPdfs = JSON.parse(deal.attachedPdf);
        console.log('📎 Parsed attached PDFs array, count:', attachedPdfs.length);
        console.log('📎 Array check:', Array.isArray(attachedPdfs));
        
        if (Array.isArray(attachedPdfs) && attachedPdfs.length > 0) {
          for (let i = 0; i < attachedPdfs.length; i++) {
            const pdfDataUrl = attachedPdfs[i];
            console.log(`📎 Processing attached PDF ${i + 1}/${attachedPdfs.length}`);
            console.log(`📎 Data URL starts with:`, pdfDataUrl.substring(0, 50));
            
            // Extract base64 data from data URL
            const splitIndex = pdfDataUrl.indexOf(',');
            console.log(`📎 Split index:`, splitIndex);
            
            if (splitIndex === -1) {
              console.error(`❌ PDF ${i + 1} has invalid data URL format (no comma found)`);
              throw new Error('Failed to merge attached PDF. Only the main PDF will be uploaded.');
            }
            
            const base64Data = pdfDataUrl.substring(splitIndex + 1);
            console.log(`📎 Base64 data length:`, base64Data.length);
            console.log(`📎 Base64 first 50 chars:`, base64Data.substring(0, 50));
            
            if (!base64Data || base64Data.length === 0) {
              console.error(`❌ PDF ${i + 1} has no base64 data`);
              throw new Error('Failed to merge attached PDF. Only the main PDF will be uploaded.');
            }
            
            console.log(`📎 Creating buffer from base64...`);
            const pdfBytes = Buffer.from(base64Data, 'base64');
            console.log(`📎 Buffer created, size:`, pdfBytes.length, 'bytes');
            
            console.log(`📎 Loading PDF document...`);
            const attachedDoc = await PDFDocument.load(pdfBytes);
            console.log(`📎 PDF loaded successfully, pages:`, attachedDoc.getPageCount());
            
            console.log(`📎 Copying pages to merged document...`);
            const attachedPages = await pdfDoc.copyPages(attachedDoc, attachedDoc.getPageIndices());
            attachedPages.forEach(page => pdfDoc.addPage(page));
            console.log(`✅ Successfully merged PDF ${i + 1} (${attachedPages.length} pages)`);
          }
        } else {
          console.log('⚠️ No PDFs to merge or not an array');
        }
      } catch (e) {
        console.error('❌ Error merging attached PDFs:', e.message);
        console.error('❌ Error name:', e.name);
        console.error('❌ Stack:', e.stack);
        throw e; // Re-throw to be caught by outer try-catch
      }
    } else {
      console.log('ℹ️ No attached PDFs in deal data');
    }
    
    // Save the merged PDF
    const mergedPdfBytes = await pdfDoc.save();
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="deal-${deal.loanNumber || deal.id}.pdf"`);
    res.send(Buffer.from(mergedPdfBytes));
    
  } catch (err) {
    console.error('PDF generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// === Database Endpoints ===

// Create or update a deal
app.post("/api/deals", async (req, res) => {
  try {
    const data = req.body;
    console.log('📝 Creating deal:', data.loanNumber, data.address);
    console.log('  - Has images:', !!(data.hero || data.int1 || data.int2 || data.int3 || data.int4));
    console.log('  - Has PDFs:', !!data.attachedPdf);
    if (data.attachedPdf) {
      try {
        const pdfs = JSON.parse(data.attachedPdf);
        console.log('  - PDF count:', pdfs.length);
      } catch(e) {
        console.log('  - PDF parse error:', e.message);
      }
    }
    
    if (db.isPostgres) {
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
      
      const result = await db.query(queryText, queryValues);
      console.log('✅ Deal created with ID:', result.rows[0].id);
      res.json({ ok: true, id: result.rows[0].id });
    } else {
      // SQLite - extract values to avoid parameter issues
      const values = [
        data.loanNumber, data.amount, data.rateType, data.term, data.monthlyReturn, data.ltv,
        data.address, data.appraisal, data.rent, data.sqft, data.bedsBaths, data.marketLocation,
        data.marketOverview, data.dealInformation, data.hero, data.int1, data.int2,
        data.int3, data.int4, data.attachedPdf
      ];
      const stmt = db.prepare(`
        INSERT INTO deals (
          loanNumber, amount, rateType, term, monthlyReturn, ltv,
          address, appraisal, rent, sqft, bedsBaths, marketLocation,
          marketOverview, dealInformation, heroImage, int1Image, int2Image,
          int3Image, int4Image, attachedPdf
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(...values);
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
    
    if (db.isPostgres) {
      // PostgreSQL
      if (search) {
        const result = await db.query(
          'SELECT * FROM deals WHERE address ILIKE $1 OR "loanNumber" ILIKE $2 ORDER BY "updatedAt" DESC',
          [`%${search}%`, `%${search}%`]
        );
        deals = result.rows;
      } else {
        const result = await db.query('SELECT * FROM deals ORDER BY "updatedAt" DESC');
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
    
    if (db.isPostgres) {
      // PostgreSQL
      const result = await db.query(
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
    console.log('📝 Updating deal:', req.params.id);
    console.log('  - Has images:', !!(data.hero || data.int1 || data.int2 || data.int3 || data.int4));
    console.log('  - Has PDFs:', !!data.attachedPdf);
    if (data.attachedPdf) {
      try {
        const pdfs = JSON.parse(data.attachedPdf);
        console.log('  - PDF count:', pdfs.length);
      } catch(e) {
        console.log('  - PDF parse error:', e.message);
      }
    }
    
    if (db.isPostgres) {
      // PostgreSQL
      await db.query(
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
      // SQLite - extract values to avoid parameter issues
      const values = [
        data.loanNumber, data.amount, data.rateType, data.term, data.monthlyReturn, data.ltv,
        data.address, data.appraisal, data.rent, data.sqft, data.bedsBaths, data.marketLocation,
        data.marketOverview, data.dealInformation, data.hero, data.int1, data.int2,
        data.int3, data.int4, data.attachedPdf, req.params.id
      ];
      const stmt = db.prepare(`
        UPDATE deals SET
          loanNumber=?, amount=?, rateType=?, term=?, monthlyReturn=?, ltv=?,
          address=?, appraisal=?, rent=?, sqft=?, bedsBaths=?, marketLocation=?,
          marketOverview=?, dealInformation=?, heroImage=?, int1Image=?, int2Image=?,
          int3Image=?, int4Image=?, attachedPdf=?, updatedAt=CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      stmt.run(...values);
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
    if (db.isPostgres) {
      // PostgreSQL
      await db.query(
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

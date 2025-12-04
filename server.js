// server.js
console.log('Starting server initialization...');
import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import pg from 'pg';
import session from 'express-session';
import puppeteer from 'puppeteer';
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

// Trust proxy - required for Railway/Heroku to work with secure cookies
app.set('trust proxy', 1);

app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'safeguard-deal-sheet-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.DATABASE_URL ? true : false, // Use secure cookies on Railway (has DATABASE_URL)
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax'
  }
}));

// Authentication credentials (hardcoded for now)
const AUTH_USERNAME = process.env.AUTH_USERNAME || 'admin';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'safeguard2024';

// Authentication middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized' });
}

// Serve static files (but login page is always accessible)
app.use(express.static("public"));

// === Authentication endpoints ===
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  if (username === AUTH_USERNAME && password === AUTH_PASSWORD) {
    req.session.authenticated = true;
    req.session.username = username;
    res.json({ success: true, message: 'Login successful' });
  } else {
    res.status(401).json({ error: 'Invalid username or password' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

app.get('/api/check-auth', (req, res) => {
  if (req.session && req.session.authenticated) {
    res.json({ authenticated: true, username: req.session.username });
  } else {
    res.json({ authenticated: false });
  }
});

// === Storage setup ===
const STORAGE_DIR = process.env.STORAGE_DIR || path.join(process.cwd(), "storage");
if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });

const upload = multer({ storage: multer.memoryStorage() });

// === Upload endpoint ===
app.post("/api/pdfs", requireAuth, upload.single("file"), async (req, res) => {
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
app.post("/api/generate-pdf/:id", requireAuth, async (req, res) => {
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
    
    // Load and encode logo as base64
    let logoDataUrl = '';
    try {
      const logoPath = path.join(process.cwd(), 'public', 'preview', 'assets', 'Safeguard_Logo_Cropped.png');
      const logoBuffer = fs.readFileSync(logoPath);
      const logoBase64 = logoBuffer.toString('base64');
      logoDataUrl = `data:image/png;base64,${logoBase64}`;
    } catch (logoErr) {
      console.warn('Failed to load logo:', logoErr.message);
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
    
    console.log('🎨 Generating PDF for deal:', deal.id);
    
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
    
    // Build HTML for the deal sheet matching the preview page layout
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    :root {
      --blue: #1E66B4;
      --muted: #3C3C3C;
      --card: #F2F5F8;
      --stroke: #D2D2D2;
      --text: #141414;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
      background: white;
    }
    .page {
      width: 8.5in;
      height: 11in;
      padding: 0.5in;
      background: #FFFFFF;
      position: relative;
    }
    
    /* Header */
    .header {
      position: relative;
      height: 1.5in;
      margin-bottom: 0.15in;
    }
    .header .logo {
      position: absolute;
      top: -0.2in;
      left: -0.2in;
      height: 1in;
    }
    .header .phone {
      position: absolute;
      top: 0.2in;
      right: 0.2in;
      font-size: 18pt;
      color: var(--blue);
      font-weight: 700;
    }
    .header .tagline {
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      top: 1.1in;
      font-weight: 700;
      color: var(--text);
      font-size: 18pt;
      white-space: nowrap;
    }
    
    /* Body grid */
    .content {
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-gap: 0.2in;
    }
    
    /* Left side - photos */
    .left .hero {
      height: 2.8in;
      background: #F5F5F5;
      border: 2px solid var(--stroke);
      border-radius: 14px;
      background-size: cover;
      background-position: center;
    }
    .left .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-gap: 0.15in;
      margin-top: 0.15in;
      height: 2.8in;
    }
    .photo {
      background: #F5F5F5;
      border: 2px solid var(--stroke);
      border-radius: 14px;
      background-size: cover;
      background-position: center;
      height: 1.25in;
    }
    
    /* Right side - info cards */
    .right .card {
      background: var(--card);
      border: 1.5px solid var(--stroke);
      border-radius: 14px;
      padding: 0.2in;
      margin-bottom: 0.2in;
      height: 2.8in;
      box-sizing: border-box;
    }
    .right .card h2 {
      color: var(--blue);
      margin: 0 0 0.15in 0;
      font-size: 15pt;
    }
    
    /* Loan Summary grid */
    .kv-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-column-gap: 0.25in;
      grid-row-gap: 0.18in;
    }
    .kv .k {
      font-weight: 800;
      color: var(--text);
      font-size: 12pt;
      margin-bottom: 2px;
    }
    .kv .v {
      font-weight: 500;
      color: var(--text);
      font-size: 12pt;
    }
    
    /* Property Details facts */
    .facts .row {
      display: grid;
      grid-template-columns: 1.8in 1fr;
      align-items: baseline;
      margin-bottom: 0.12in;
    }
    .facts .label {
      font-weight: 800;
      color: var(--text);
      font-size: 12pt;
    }
    .facts .value {
      color: var(--muted);
      font-size: 12pt;
    }
    
    /* Overview */
    .overview {
      margin-top: 0.15in;
    }
    .overview h2 {
      font-size: 13pt;
      margin-bottom: 0.08in;
      color: var(--text);
    }
    .overview p {
      color: var(--muted);
      font-size: 11pt;
      line-height: 1.3;
      margin: 0;
      max-width: 7in;
    }
    .deal-info-block {
      margin-top: 0.15in;
    }
    .deal-info-block h2 {
      font-size: 13pt;
      margin-bottom: 0.08in;
      color: var(--text);
    }
    
    /* Footer */
    .footer {
      position: absolute;
      left: 0.5in;
      right: 0.5in;
      bottom: 0.4in;
      text-align: center;
      font-size: 10pt;
      color: var(--muted);
    }
    .footer hr {
      margin-bottom: 0.1in;
      border: none;
      border-top: 1px solid var(--stroke);
    }
    .footer p {
      margin: 0.05in 0;
    }
  </style>
</head>
<body>
  <div class="page">
    <header class="header">
      ${logoDataUrl ? `<img src="${logoDataUrl}" class="logo" alt="Safeguard Logo" />` : ''}
      <div class="phone">877-280-5771</div>
      <div class="tagline">Private Lending Secured by Real Estate</div>
    </header>

    <main class="content">
      <section class="left photos">
        <div class="hero" style="${deal.heroImage ? `background-image: url('${deal.heroImage}');` : ''}"></div>
        <div class="grid">
          <div class="photo" style="${deal.int1Image ? `background-image: url('${deal.int1Image}');` : ''}"></div>
          <div class="photo" style="${deal.int2Image ? `background-image: url('${deal.int2Image}');` : ''}"></div>
          <div class="photo" style="${deal.int3Image ? `background-image: url('${deal.int3Image}');` : ''}"></div>
          <div class="photo" style="${deal.int4Image ? `background-image: url('${deal.int4Image}');` : ''}"></div>
        </div>
      </section>

      <section class="right info">
        <div class="card">
          <h2>LOAN SUMMARY</h2>
          <div class="kv-grid">
            <div class="kv"><div class="k">LOAN #</div><div class="v">${deal.loanNumber || ''}</div></div>
            <div class="kv"><div class="k">AMOUNT</div><div class="v">${deal.amount || ''}</div></div>
            <div class="kv"><div class="k">RATE / TYPE</div><div class="v">${deal.rateType || ''}</div></div>
            <div class="kv"><div class="k">TERM</div><div class="v">${deal.term || ''}</div></div>
            <div class="kv"><div class="k">MONTHLY RETURN</div><div class="v">${deal.monthlyReturn || ''}</div></div>
            <div class="kv"><div class="k">LTV</div><div class="v">${deal.ltv || ''}</div></div>
          </div>
        </div>

        <div class="card">
          <h2>PROPERTY DETAILS</h2>
          <div class="facts">
            <div class="row"><div class="label">Address:</div><div class="value">${deal.address || ''}</div></div>
            <div class="row"><div class="label">Appraisal:</div><div class="value">${deal.appraisal || ''}</div></div>
            <div class="row"><div class="label">Rent:</div><div class="value">${deal.rent || ''}</div></div>
            <div class="row"><div class="label">Square Footage:</div><div class="value">${deal.sqft || ''}</div></div>
            <div class="row"><div class="label">Beds / Baths:</div><div class="value">${deal.bedsBaths || ''}</div></div>
          </div>
        </div>
      </section>
    </main>

    <section class="overview">
      <h2>MARKET OVERVIEW${deal.marketLocation ? ` — ${deal.marketLocation.toUpperCase()}` : ''}</h2>
      <p>${deal.marketOverview || ''}</p>
      ${deal.dealInformation ? `
      <div class="deal-info-block">
        <h2>DEAL INFORMATION</h2>
        <p>${deal.dealInformation}</p>
      </div>` : ''}
    </section>

    <footer class="footer">
      <hr />
      <p>Safeguard Capital Partners</p>
      <p>105 N College St, Martinsburg, WV 25401 | www.SafeguardCapitalPartners.com</p>
    </footer>
  </div>
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
        const attachedPdfs = JSON.parse(deal.attachedPdf);
        
        if (Array.isArray(attachedPdfs) && attachedPdfs.length > 0) {
          console.log(`📎 Merging ${attachedPdfs.length} attached PDF(s)`);
          
          for (let i = 0; i < attachedPdfs.length; i++) {
            const pdfItem = attachedPdfs[i];
            
            // Handle both old format (string) and new format (object with metadata)
            const pdfDataUrl = typeof pdfItem === 'string' ? pdfItem : pdfItem.dataUrl;
            const pdfName = typeof pdfItem === 'object' ? pdfItem.name : `PDF ${i + 1}`;
            
            console.log(`  Processing: ${pdfName}`);
            
            // Extract base64 data from data URL
            const splitIndex = pdfDataUrl.indexOf(',');
            if (splitIndex === -1) {
              throw new Error('Invalid PDF data URL format');
            }
            
            const base64Data = pdfDataUrl.substring(splitIndex + 1);
            if (!base64Data || base64Data.length === 0) {
              throw new Error('Empty PDF data');
            }
            
            const pdfBytes = Buffer.from(base64Data, 'base64');
            const attachedDoc = await PDFDocument.load(pdfBytes);
            const attachedPages = await pdfDoc.copyPages(attachedDoc, attachedDoc.getPageIndices());
            attachedPages.forEach(page => pdfDoc.addPage(page));
          }
          
          console.log(`✅ Successfully merged all attached PDFs`);
        }
      } catch (e) {
        console.error('❌ Error merging attached PDFs:', e.message);
        throw e;
      }
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

// === Portfolio PDF Generation ===
app.post("/api/generate-portfolio-pdf/:id", requireAuth, async (req, res) => {
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
    
    // Load logo
    let logoDataUrl = '';
    try {
      const logoPath = path.join(process.cwd(), 'public', 'preview', 'assets', 'Safeguard_Logo_Cropped.png');
      const logoBuffer = fs.readFileSync(logoPath);
      const logoBase64 = logoBuffer.toString('base64');
      logoDataUrl = `data:image/png;base64,${logoBase64}`;
    } catch (logoErr) {
      console.warn('Failed to load logo:', logoErr.message);
    }
    
    // Get portfolio data
    let portfolio;
    if (db.isPostgres) {
      const result = await db.query('SELECT * FROM portfolio_reviews WHERE id = $1', [req.params.id]);
      portfolio = result.rows[0];
    } else {
      portfolio = db.prepare('SELECT * FROM portfolio_reviews WHERE id = ?').get(req.params.id);
    }
    
    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }
    
    console.log('📊 Generating portfolio PDF for:', portfolio.investorName);
    
    // Parse loans data
    let loans = [];
    try {
      loans = JSON.parse(portfolio.loansData || '[]');
    } catch (e) {
      console.error('Failed to parse loans data:', e);
    }
    
    // Separate current and paid off loans
    const currentLoans = loans.filter(l => l.status !== 'Paid Off');
    const paidOffLoans = loans.filter(l => l.status === 'Paid Off');
    
    // Calculate totals
    const currentTotal = currentLoans.reduce((sum, l) => sum + (parseFloat(l.balance) || 0), 0);
    const currentInterest = currentLoans.reduce((sum, l) => sum + (parseFloat(l.interestPaid) || 0), 0);
    const paidOffTotal = paidOffLoans.reduce((sum, l) => sum + (parseFloat(l.balance) || 0), 0);
    const paidOffInterest = paidOffLoans.reduce((sum, l) => sum + (parseFloat(l.interestPaid) || 0), 0);
    
    // Launch browser
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
          '--single-process'
        ],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
      });
    } catch (launchErr) {
      console.error('Failed to launch browser:', launchErr);
      return res.status(500).json({ error: 'Failed to start PDF generator: ' + launchErr.message });
    }
    
    const page = await browser.newPage();
    
    // Format currency
    const fmt = (num) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
    
    // Generate loan rows HTML
    const generateLoanRows = (loanList) => loanList.map(loan => `
      <tr>
        <td>${loan.address}</td>
        <td class="right">${fmt(loan.balance)}</td>
        <td class="right">${fmt(loan.interestPaid)}</td>
        <td class="center">${loan.status}</td>
      </tr>
    `).join('');
    
    // Build HTML
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Helvetica Neue', Arial, sans-serif;
      padding: 0.5in;
      color: #333;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 3px solid #1E66B4;
    }
    .logo {
      height: 80px;
      margin-bottom: 10px;
    }
    h1 {
      color: #1E66B4;
      font-size: 28pt;
      margin-bottom: 5px;
    }
    .investor-name {
      font-size: 20pt;
      color: #333;
      font-weight: 600;
    }
    .summary {
      background: #f8f9fa;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 30px;
      border: 2px solid #1E66B4;
    }
    .summary h2 {
      color: #1E66B4;
      font-size: 18pt;
      margin-bottom: 15px;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 20px;
    }
    .summary-item {
      text-align: center;
    }
    .summary-label {
      font-size: 11pt;
      color: #666;
      margin-bottom: 5px;
    }
    .summary-value {
      font-size: 20pt;
      font-weight: bold;
      color: #1E66B4;
    }
    .section {
      margin-bottom: 40px;
    }
    .section h2 {
      color: #1E66B4;
      font-size: 16pt;
      margin-bottom: 15px;
      padding-bottom: 8px;
      border-bottom: 2px solid #1E66B4;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: white;
      border: 1px solid #ddd;
    }
    th {
      background: #1E66B4;
      color: white;
      padding: 12px;
      text-align: left;
      font-size: 11pt;
    }
    th.right { text-align: right; }
    th.center { text-align: center; }
    td {
      padding: 10px;
      border-bottom: 1px solid #e0e0e0;
      font-size: 10pt;
    }
    td.right {
      text-align: right;
    }
    td.center {
      text-align: center;
    }
    .section-total {
      background: #f0f7ff;
      font-weight: bold;
      color: #1E66B4;
    }
    .footer {
      margin-top: 40px;
      text-align: center;
      font-size: 10pt;
      color: #666;
      padding-top: 20px;
      border-top: 1px solid #ddd;
    }
  </style>
</head>
<body>
  <div class="header">
    ${logoDataUrl ? `<img src="${logoDataUrl}" class="logo" alt="Safeguard">` : ''}
    <h1>Portfolio Review</h1>
    <div class="investor-name">${portfolio.investorName}</div>
  </div>

  <div class="summary">
    <h2>Summary</h2>
    <div class="summary-grid">
      <div class="summary-item">
        <div class="summary-label">Current Investment</div>
        <div class="summary-value">${fmt(portfolio.currentInvestmentTotal)}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">Lifetime Investment</div>
        <div class="summary-value">${fmt(portfolio.lifetimeInvestmentTotal)}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">Lifetime Interest Paid</div>
        <div class="summary-value">${fmt(portfolio.lifetimeInterestPaid)}</div>
      </div>
    </div>
  </div>

  ${currentLoans.length > 0 ? `
  <div class="section">
    <h2>Current Investments (${currentLoans.length} Loans)</h2>
    <table>
      <thead>
        <tr>
          <th>Address</th>
          <th class="right">Principal Balance</th>
          <th class="right">Interest Paid</th>
          <th class="center">Status</th>
        </tr>
      </thead>
      <tbody>
        ${generateLoanRows(currentLoans)}
        <tr class="section-total">
          <td><strong>Current Investment Total</strong></td>
          <td class="right"><strong>${fmt(currentTotal)}</strong></td>
          <td class="right"><strong>${fmt(currentInterest)}</strong></td>
          <td></td>
        </tr>
      </tbody>
    </table>
  </div>
  ` : ''}

  ${paidOffLoans.length > 0 ? `
  <div class="section">
    <h2>Paid Off and Closed (${paidOffLoans.length} Loans)</h2>
    <table>
      <thead>
        <tr>
          <th>Address</th>
          <th class="right">Principal Balance</th>
          <th class="right">Interest Paid</th>
          <th class="center">Status</th>
        </tr>
      </thead>
      <tbody>
        ${generateLoanRows(paidOffLoans)}
        <tr class="section-total">
          <td><strong>Paid Off Total</strong></td>
          <td class="right"><strong>${fmt(paidOffTotal)}</strong></td>
          <td class="right"><strong>${fmt(paidOffInterest)}</strong></td>
          <td></td>
        </tr>
      </tbody>
    </table>
  </div>
  ` : ''}

  <div class="footer">
    Generated on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
  </div>
</body>
</html>
    `;
    
    console.log('Setting page content...');
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    console.log('Generating PDF buffer...');
    const pdfBuffer = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' }
    });
    
    console.log('PDF buffer size:', pdfBuffer.length, 'bytes');
    
    await browser.close();
    console.log('Browser closed');
    
    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new Error('Generated PDF is empty');
    }
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', pdfBuffer.length.toString());
    res.setHeader('Content-Disposition', `attachment; filename="Portfolio-${portfolio.investorName.replace(/\s+/g, '-')}.pdf"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.end(pdfBuffer, 'binary');
    
    console.log('✅ Portfolio PDF sent successfully:', pdfBuffer.length, 'bytes');
    
  } catch (err) {
    console.error('❌ Portfolio PDF generation error:', err.message);
    console.error('Stack trace:', err.stack);
    
    // Make sure browser is closed on error
    if (browser) {
      try {
        await browser.close();
        console.log('Browser closed after error');
      } catch (closeErr) {
        console.error('Error closing browser:', closeErr.message);
      }
    }
    
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

// Generate Loan Engagement Agreement PDF
app.get("/api/deals/:id/engagement-agreement", requireAuth, async (req, res) => {
  let browser;
  try {
    console.log('🔷 Generating engagement agreement for deal:', req.params.id);
    
    // Fetch deal data
    let deal;
    if (db.isPostgres) {
      const result = await db.query('SELECT * FROM deals WHERE id = $1', [req.params.id]);
      deal = result.rows[0];
    } else {
      const stmt = db.prepare('SELECT * FROM deals WHERE id = ?');
      deal = stmt.get(req.params.id);
    }
    
    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }
    
    if (!deal.clientName || !deal.lendingEntity || !deal.clientAddress) {
      return res.status(400).json({ 
        error: 'Client Name, Client Address, and Lending Entity are required. Please edit the deal and add this information.' 
      });
    }
    
    const today = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    // Generate HTML for engagement agreement
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Loan Engagement Agreement</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Times New Roman', Times, serif;
          font-size: 12pt;
          line-height: 1.6;
          color: #000;
          padding: 40px 60px;
        }
        h1 {
          text-align: center;
          font-size: 18pt;
          margin-bottom: 30px;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        h2 {
          font-size: 14pt;
          margin-top: 25px;
          margin-bottom: 15px;
          text-decoration: underline;
        }
        p {
          margin-bottom: 15px;
          text-align: justify;
        }
        .section {
          margin-bottom: 20px;
        }
        .signature-line {
          margin-top: 50px;
          border-top: 1px solid #000;
          width: 300px;
          padding-top: 5px;
        }
        .signature-block {
          margin-top: 60px;
          display: inline-block;
          width: 45%;
        }
        .signature-block:last-child {
          margin-left: 8%;
        }
        .info-box {
          background: #f5f5f5;
          border: 1px solid #ccc;
          padding: 15px;
          margin: 20px 0;
        }
        .info-row {
          margin-bottom: 8px;
        }
        .info-label {
          font-weight: bold;
          display: inline-block;
          width: 150px;
        }
      </style>
    </head>
    <body>
      <h1>Loan Engagement Agreement</h1>
      
      <div class="info-box">
        <div class="info-row">
          <span class="info-label">Date:</span>
          <span>${today}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Loan Number:</span>
          <span>${deal.loanNumber}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Borrower:</span>
          <span>${deal.clientName}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Borrower Address:</span>
          <span>${deal.clientAddress}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Property Address:</span>
          <span>${deal.address}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Loan Amount:</span>
          <span>${deal.amount}</span>
        </div>
      </div>
      
      <div class="section">
        <p>
          This Loan Engagement Agreement ("Agreement") is entered into as of ${today}, by and between 
          <strong>${deal.lendingEntity}</strong> ("Lender") and <strong>${deal.clientName}</strong> ("Borrower").
        </p>
      </div>
      
      <div class="section">
        <h2>1. Loan Terms</h2>
        <p>
          Lender agrees to provide Borrower with a loan in the principal amount of ${deal.amount} ("Loan Amount") 
          for the property located at ${deal.address} ("Property"). The loan will be subject to the following terms:
        </p>
        <ul style="margin-left: 30px; margin-top: 10px;">
          <li>Interest Rate/Type: ${deal.rateType || 'As agreed'}</li>
          <li>Term: ${deal.term || 'As agreed'}</li>
          <li>Monthly Payment: ${deal.monthlyReturn || 'As calculated'}</li>
          <li>Loan-to-Value (LTV): ${deal.ltv || 'As appraised'}</li>
        </ul>
      </div>
      
      <div class="section">
        <h2>2. Property Information</h2>
        <p>
          The loan will be secured by the Property with an appraised value of ${deal.appraisal || 'To be determined'}. 
          ${deal.bedsBaths ? `The Property consists of ${deal.bedsBaths}.` : ''} 
          ${deal.rent ? `The estimated monthly rental income is ${deal.rent}.` : ''}
        </p>
      </div>
      
      <div class="section">
        <h2>3. Borrower Representations</h2>
        <p>
          Borrower represents and warrants that all information provided in connection with this loan application 
          is true, accurate, and complete. Borrower agrees to provide any additional documentation reasonably 
          requested by Lender to complete the underwriting and closing of the loan.
        </p>
      </div>
      
      <div class="section">
        <h2>4. Conditions Precedent</h2>
        <p>
          This Agreement and Lender's obligation to fund the loan are subject to the following conditions:
        </p>
        <ul style="margin-left: 30px; margin-top: 10px;">
          <li>Satisfactory completion of due diligence, including title review and property inspection</li>
          <li>Execution of final loan documents acceptable to Lender</li>
          <li>Receipt of all required third-party reports (appraisal, insurance, etc.)</li>
          <li>No material adverse change in Borrower's financial condition or the Property</li>
        </ul>
      </div>
      
      <div class="section">
        <h2>5. Closing</h2>
        <p>
          The parties agree to use commercially reasonable efforts to close the loan within a mutually agreed timeframe. 
          The exact closing date will be determined based on the satisfaction of all conditions precedent and the 
          availability of both parties.
        </p>
      </div>
      
      <div class="section">
        <h2>6. Expenses</h2>
        <p>
          Borrower agrees to pay all reasonable costs and expenses incurred in connection with the loan, including 
          but not limited to appraisal fees, title insurance, recording fees, and legal fees.
        </p>
      </div>
      
      <div class="section">
        <h2>7. Non-Binding</h2>
        <p>
          This Agreement represents the parties' intent to proceed with the loan transaction but does not constitute 
          a binding commitment to fund or accept the loan. The parties' obligations will become binding only upon 
          execution of definitive loan documents.
        </p>
      </div>
      
      <div class="section">
        <h2>8. Governing Law</h2>
        <p>
          This Agreement shall be governed by and construed in accordance with the laws of the jurisdiction where 
          the Property is located.
        </p>
      </div>
      
      <div style="margin-top: 80px;">
        <div class="signature-block">
          <div class="signature-line"></div>
          <div style="margin-top: 5px;">
            <strong>${deal.lendingEntity}</strong><br>
            By: _______________________<br>
            Name:<br>
            Title:<br>
            Date:
          </div>
        </div>
        
        <div class="signature-block">
          <div class="signature-line"></div>
          <div style="margin-top: 5px;">
            <strong>${deal.clientName}</strong><br>
            Borrower<br><br><br>
            Date:
          </div>
        </div>
      </div>
    </body>
    </html>
    `;
    
    console.log('Launching Puppeteer for engagement agreement...');
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });
    
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    const pdfBuffer = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: { top: '0.75in', right: '0.75in', bottom: '0.75in', left: '0.75in' }
    });
    
    await browser.close();
    
    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new Error('Generated PDF is empty');
    }
    
    const filename = `Engagement-Agreement-${deal.loanNumber}-${deal.clientName.replace(/\s+/g, '-')}.pdf`;
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', pdfBuffer.length.toString());
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.end(pdfBuffer, 'binary');
    
    console.log('✅ Engagement agreement PDF sent successfully:', pdfBuffer.length, 'bytes');
    
  } catch (err) {
    console.error('❌ Engagement agreement PDF generation error:', err.message);
    console.error('Stack trace:', err.stack);
    
    if (browser) {
      try {
        await browser.close();
      } catch (closeErr) {
        console.error('Error closing browser:', closeErr.message);
      }
    }
    
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

// === Database Endpoints ===

// Create or update a deal
app.post("/api/deals", requireAuth, async (req, res) => {
  try {
    const data = req.body;
    console.log('📝 Creating deal:', data.loanNumber, data.address);
    
    if (db.isPostgres) {
      // PostgreSQL
      console.log('Using PostgreSQL');
      const queryText = `INSERT INTO deals (
        "loanNumber", amount, "rateType", term, "monthlyReturn", ltv,
        address, appraisal, rent, sqft, "bedsBaths", "marketLocation",
        "marketOverview", "dealInformation", "heroImage", "int1Image", "int2Image",
        "int3Image", "int4Image", "attachedPdf", "clientName", "lendingEntity", "clientAddress"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
      RETURNING id`;
      
      const queryValues = [
        data.loanNumber, data.amount, data.rateType, data.term, data.monthlyReturn, data.ltv,
        data.address, data.appraisal, data.rent, data.sqft, data.bedsBaths, data.marketLocation,
        data.marketOverview, data.dealInformation, data.hero, data.int1, data.int2,
        data.int3, data.int4, data.attachedPdf, data.clientName, data.lendingEntity, data.clientAddress
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
        data.int3, data.int4, data.attachedPdf, data.clientName, data.lendingEntity, data.clientAddress
      ];
      const stmt = db.prepare(`
        INSERT INTO deals (
          loanNumber, amount, rateType, term, monthlyReturn, ltv,
          address, appraisal, rent, sqft, bedsBaths, marketLocation,
          marketOverview, dealInformation, heroImage, int1Image, int2Image,
          int3Image, int4Image, attachedPdf, clientName, lendingEntity, clientAddress
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

// Get all deals (searchable by address, filterable by archived status)
app.get("/api/deals", requireAuth, async (req, res) => {
  try {
    const search = req.query.search || '';
    const archived = req.query.archived === 'true';
    let deals;
    
    if (db.isPostgres) {
      // PostgreSQL
      if (search) {
        const result = await db.query(
          'SELECT * FROM deals WHERE (address ILIKE $1 OR "loanNumber" ILIKE $2) AND archived = $3 ORDER BY "updatedAt" DESC',
          [`%${search}%`, `%${search}%`, archived]
        );
        deals = result.rows;
      } else {
        const result = await db.query('SELECT * FROM deals WHERE archived = $1 ORDER BY "updatedAt" DESC', [archived]);
        deals = result.rows;
      }
    } else {
      // SQLite
      if (search) {
        const stmt = db.prepare('SELECT * FROM deals WHERE (address LIKE ? OR loanNumber LIKE ?) AND archived = ? ORDER BY updatedAt DESC');
        deals = stmt.all(`%${search}%`, `%${search}%`, archived ? 1 : 0);
      } else {
        deals = db.prepare('SELECT * FROM deals WHERE archived = ? ORDER BY updatedAt DESC').all(archived ? 1 : 0);
      }
    }
    res.json(deals);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Get a single deal by ID
app.get("/api/deals/:id", requireAuth, async (req, res) => {
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
app.put("/api/deals/:id", requireAuth, async (req, res) => {
  try {
    const data = req.body;
    console.log('📝 Updating deal:', req.params.id);
    
    if (db.isPostgres) {
      // PostgreSQL
      await db.query(
        `UPDATE deals SET
          "loanNumber"=$2, amount=$3, "rateType"=$4, term=$5, "monthlyReturn"=$6, ltv=$7,
          address=$8, appraisal=$9, rent=$10, sqft=$11, "bedsBaths"=$12, "marketLocation"=$13,
          "marketOverview"=$14, "dealInformation"=$15, "heroImage"=$16, "int1Image"=$17, "int2Image"=$18,
          "int3Image"=$19, "int4Image"=$20, "attachedPdf"=$21, "clientName"=$22, "lendingEntity"=$23, "clientAddress"=$24, "updatedAt"=CURRENT_TIMESTAMP
        WHERE id = $1`,
        [
          req.params.id,
          data.loanNumber, data.amount, data.rateType, data.term, data.monthlyReturn, data.ltv,
          data.address, data.appraisal, data.rent, data.sqft, data.bedsBaths, data.marketLocation,
          data.marketOverview, data.dealInformation, data.hero, data.int1, data.int2,
          data.int3, data.int4, data.attachedPdf, data.clientName, data.lendingEntity, data.clientAddress
        ]
      );
    } else {
      // SQLite - extract values to avoid parameter issues
      const values = [
        data.loanNumber, data.amount, data.rateType, data.term, data.monthlyReturn, data.ltv,
        data.address, data.appraisal, data.rent, data.sqft, data.bedsBaths, data.marketLocation,
        data.marketOverview, data.dealInformation, data.hero, data.int1, data.int2,
        data.int3, data.int4, data.attachedPdf, data.clientName, data.lendingEntity, data.clientAddress, req.params.id
      ];
      const stmt = db.prepare(`
        UPDATE deals SET
          loanNumber=?, amount=?, rateType=?, term=?, monthlyReturn=?, ltv=?,
          address=?, appraisal=?, rent=?, sqft=?, bedsBaths=?, marketLocation=?,
          marketOverview=?, dealInformation=?, heroImage=?, int1Image=?, int2Image=?,
          int3Image=?, int4Image=?, attachedPdf=?, clientName=?, lendingEntity=?, clientAddress=?, updatedAt=CURRENT_TIMESTAMP
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
app.delete("/api/deals/:id", requireAuth, async (req, res) => {
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

// Archive/Unarchive a deal
app.patch("/api/deals/:id/archive", requireAuth, async (req, res) => {
  try {
    const { archived } = req.body;
    
    if (db.isPostgres) {
      await db.query(
        'UPDATE deals SET archived = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2',
        [archived, req.params.id]
      );
    } else {
      db.prepare('UPDATE deals SET archived = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?')
        .run(archived ? 1 : 0, req.params.id);
    }
    
    res.json({ ok: true, archived });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ============================
// Portfolio Review API Routes
// ============================

// Get all portfolios (filterable by archived status)
app.get("/api/portfolios", requireAuth, async (req, res) => {
  try {
    const search = req.query.search || '';
    const archived = req.query.archived === 'true';
    
    if (db.isPostgres) {
      const result = await db.query(
        `SELECT * FROM portfolio_reviews 
         WHERE "investorName" ILIKE $1 AND archived = $2
         ORDER BY "updatedAt" DESC`,
        [`%${search}%`, archived]
      );
      res.json(result.rows);
    } else {
      const stmt = db.prepare(
        `SELECT * FROM portfolio_reviews 
         WHERE investorName LIKE ? AND archived = ?
         ORDER BY updatedAt DESC`
      );
      const portfolios = stmt.all(`%${search}%`, archived ? 1 : 0);
      res.json(portfolios);
    }
  } catch (e) {
    console.error('Error fetching portfolios:', e);
    res.status(500).json({ error: e.message });
  }
});

// Get single portfolio
app.get("/api/portfolios/:id", requireAuth, async (req, res) => {
  try {
    if (db.isPostgres) {
      const result = await db.query(
        'SELECT * FROM portfolio_reviews WHERE id = $1',
        [req.params.id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Portfolio not found' });
      }
      res.json(result.rows[0]);
    } else {
      const stmt = db.prepare('SELECT * FROM portfolio_reviews WHERE id = ?');
      const portfolio = stmt.get(req.params.id);
      if (!portfolio) {
        return res.status(404).json({ error: 'Portfolio not found' });
      }
      res.json(portfolio);
    }
  } catch (e) {
    console.error('Error fetching portfolio:', e);
    res.status(500).json({ error: e.message });
  }
});

// Create portfolio
app.post("/api/portfolios", requireAuth, async (req, res) => {
  try {
    const data = req.body;
    console.log('📊 Creating portfolio:', data.investorName);
    console.log('Database type:', db.isPostgres ? 'PostgreSQL' : 'SQLite');
    
    if (db.isPostgres) {
      console.log('Executing PostgreSQL INSERT...');
      const result = await db.query(
        `INSERT INTO portfolio_reviews 
         ("investorName", "loansData", "currentInvestmentTotal", "lifetimeInvestmentTotal", "lifetimeInterestPaid") 
         VALUES ($1, $2, $3, $4, $5) 
         RETURNING id`,
        [data.investorName, data.loansData, data.currentInvestmentTotal, 
         data.lifetimeInvestmentTotal, data.lifetimeInterestPaid]
      );
      console.log('✅ Portfolio created with ID:', result.rows[0].id);
      res.json({ ok: true, id: result.rows[0].id });
    } else {
      console.log('Executing SQLite INSERT...');
      const stmt = db.prepare(
        `INSERT INTO portfolio_reviews 
         (investorName, loansData, currentInvestmentTotal, lifetimeInvestmentTotal, lifetimeInterestPaid) 
         VALUES (?, ?, ?, ?, ?)`
      );
      const result = stmt.run(
        data.investorName, data.loansData, data.currentInvestmentTotal,
        data.lifetimeInvestmentTotal, data.lifetimeInterestPaid
      );
      console.log('✅ Portfolio created with ID:', result.lastInsertRowid);
      res.json({ ok: true, id: result.lastInsertRowid });
    }
  } catch (e) {
    console.error('❌ Error creating portfolio:', e.message);
    console.error('Stack:', e.stack);
    res.status(500).json({ error: e.message });
  }
});

// Update portfolio
app.put("/api/portfolios/:id", requireAuth, async (req, res) => {
  try {
    const data = req.body;
    
    if (db.isPostgres) {
      await db.query(
        `UPDATE portfolio_reviews SET 
         "investorName"=$1, "loansData"=$2, "currentInvestmentTotal"=$3, 
         "lifetimeInvestmentTotal"=$4, "lifetimeInterestPaid"=$5, "updatedAt"=CURRENT_TIMESTAMP 
         WHERE id=$6`,
        [data.investorName, data.loansData, data.currentInvestmentTotal,
         data.lifetimeInvestmentTotal, data.lifetimeInterestPaid, req.params.id]
      );
    } else {
      const stmt = db.prepare(
        `UPDATE portfolio_reviews SET 
         investorName=?, loansData=?, currentInvestmentTotal=?, 
         lifetimeInvestmentTotal=?, lifetimeInterestPaid=?, updatedAt=CURRENT_TIMESTAMP 
         WHERE id=?`
      );
      stmt.run(
        data.investorName, data.loansData, data.currentInvestmentTotal,
        data.lifetimeInvestmentTotal, data.lifetimeInterestPaid, req.params.id
      );
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('Error updating portfolio:', e);
    res.status(500).json({ error: e.message });
  }
});

// Archive/Unarchive a portfolio
app.patch("/api/portfolios/:id/archive", requireAuth, async (req, res) => {
  try {
    const { archived } = req.body;
    
    if (db.isPostgres) {
      await db.query(
        'UPDATE portfolio_reviews SET archived = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $2',
        [archived, req.params.id]
      );
    } else {
      db.prepare('UPDATE portfolio_reviews SET archived = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?')
        .run(archived ? 1 : 0, req.params.id);
    }
    
    res.json({ ok: true, archived });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Delete portfolio
app.delete("/api/portfolios/:id", requireAuth, async (req, res) => {
  try {
    if (db.isPostgres) {
      await db.query('DELETE FROM portfolio_reviews WHERE id = $1', [req.params.id]);
    } else {
      db.prepare('DELETE FROM portfolio_reviews WHERE id = ?').run(req.params.id);
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('Error deleting portfolio:', e);
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

// populate.js
// Reads form data from sessionStorage['safeguard_preview'] and populates the preview template.
(function () {
  function safeText(v) {
    return v == null ? '' : String(v);
  }

  function setKV(labelText, value) {
    const kvs = document.querySelectorAll('.kv');
    kvs.forEach(kv => {
      const k = kv.querySelector('.k');
      const v = kv.querySelector('.v');
      if (!k || !v) return;
      if (k.textContent.trim().toLowerCase() === labelText.toLowerCase()) {
        v.textContent = safeText(value);
      }
    });
  }

  function setFact(labelText, value) {
    const rows = document.querySelectorAll('.facts .row');
    rows.forEach(row => {
      const label = row.querySelector('.label');
      const val = row.querySelector('.value');
      if (!label || !val) return;
      if (label.textContent.replace(':','').trim().toLowerCase() === labelText.toLowerCase()) {
        val.textContent = safeText(value);
      }
    });
  }

  async function run() {
    try {
      // Check if dealId is in URL - if so, fetch from API
      const params = new URLSearchParams(window.location.search);
      const dealId = params.get('dealId');
      
      let data;
      if (dealId) {
        // Load from API
        const res = await fetch(`/api/deals/${dealId}`);
        if (!res.ok) throw new Error('Failed to load deal');
        data = await res.json();
      } else {
        // Load from sessionStorage (for new unsaved deals)
        const raw = sessionStorage.getItem('safeguard_preview');
        if (!raw) {
          console.warn('No preview data found in sessionStorage (key: safeguard_preview).');
          return;
        }
        data = JSON.parse(raw);
      }
      
      // expose parsed data for other scripts (and for auto-generation)
      window.__safeguard_preview_data = data;

      // Loan summary KV pairs
      setKV('LOAN #', data.loanNumber);
      setKV('AMOUNT', data.amount);
      setKV('RATE / TYPE', data.rateType);
      setKV('TERM', data.term);
      setKV('MONTHLY RETURN', data.monthlyReturn);
      setKV('LTV', data.ltv);

      // Property details rows
      setFact('Address', data.address);
      setFact('Appraisal', data.appraisal);
      setFact('Rent', data.rent);
      setFact('Square Footage', data.sqft || data.squareFootage);
      setFact('Beds / Baths', data.bedsBaths || data.bedBaths);


      // Market overview and location
      const overviewP = document.querySelector('#v-marketOverview');
      if (overviewP && data.marketOverview) overviewP.textContent = data.marketOverview;
      const loc = document.querySelector('#v-marketLocation');
      if (loc && data.marketLocation) loc.textContent = data.marketLocation;

      // Deal Information
      const dealInfoP = document.querySelector('#v-dealInformation');
      if (dealInfoP && data.dealInformation) dealInfoP.textContent = data.dealInformation;

      // If there are placeholders for photos, try to set background images if data contains URLs
      // Expecting keys: hero, int1, int2, int3, int4 containing data URLs or absolute URLs
      const photoMap = [
        ['hero', '.photo.hero'],
        ['int1', '.grid .photo.slot:nth-child(1)'],
        ['int2', '.grid .photo.slot:nth-child(2)'],
        ['int3', '.grid .photo.slot:nth-child(3)'],
        ['int4', '.grid .photo.slot:nth-child(4)']
      ];
      photoMap.forEach(([key, selector]) => {
        // Check both key and keyImage (database format)
        const url = data[key] || data[key + 'Image'];
        if (!url) {
          console.log(`No image found for ${key}, checked:`, key, key + 'Image');
          return;
        }
        const el = document.querySelector(selector);
        if (!el) {
          console.log(`No element found for selector: ${selector}`);
          return;
        }
        el.style.backgroundImage = `url("${url}")`;
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = 'center';
        // remove placeholder text
        const span = el.querySelector('span'); if (span) span.style.display = 'none';
      });

      // Wire manual Generate PDF button
      const genBtn = document.getElementById('generatePdf');
      if (genBtn) genBtn.addEventListener('click', () => generateAndUpload(data));

      // If URL has ?autogen=1 trigger PDF generation and upload
      const params = new URLSearchParams(window.location.search);
      if (params.get('autogen') === '1') {
        // wait briefly to ensure images/styles applied
        setTimeout(() => {
          generateAndUpload(data).catch(err => console.error('Auto-generate failed', err));
        }, 600);
      }

    } catch (err) {
      console.error('Preview populate error:', err);
    }
  }

  async function generateAndUpload(data) {
    try {
      const pageEl = document.getElementById('page');
      if (!pageEl) throw new Error('Preview page element not found');

      const opt = {
        margin: [0, 0, 0, 0],
        filename: `Safeguard_Deal_Sheet_${(data.loanNumber||'deal')}_${new Date().toISOString().slice(0,10)}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
      };

      // Generate the main PDF as a blob
      const mainBlob = await html2pdf().set(opt).from(pageEl).outputPdf('blob');

      // If an attached PDF exists, merge it
      let finalBlob = mainBlob;
      if (data.attachedPdf) {
        try {
          // Load both PDFs using pdf-lib
          const mainPdfBytes = await mainBlob.arrayBuffer();
          let attachedPdfBytes;
          if (data.attachedPdf.startsWith('data:')) {
            // Convert data URL to ArrayBuffer
            const res = await fetch(data.attachedPdf);
            attachedPdfBytes = await res.arrayBuffer();
          } else {
            // Assume it's a URL
            attachedPdfBytes = await fetch(data.attachedPdf).then(r => r.arrayBuffer());
          }
          const mainDoc = await window.PDFLib.PDFDocument.load(mainPdfBytes);
          const attachDoc = await window.PDFLib.PDFDocument.load(attachedPdfBytes);
          const pages = await mainDoc.copyPages(attachDoc, attachDoc.getPageIndices());
          pages.forEach(p => mainDoc.addPage(p));
          const mergedBytes = await mainDoc.save();
          finalBlob = new Blob([mergedBytes], { type: 'application/pdf' });
        } catch (mergeErr) {
          alert('Failed to merge attached PDF. Only the main PDF will be uploaded.');
          console.error('Failed to merge attached PDF:', mergeErr);
          // fallback: just upload the main PDF
        }
      }

      const fd = new FormData();
      fd.append('file', finalBlob, opt.filename);
      fd.append('meta', JSON.stringify({ loanNumber: data.loanNumber, address: data.address }));

      const res = await fetch('/api/pdfs', { method: 'POST', body: fd });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Upload failed');
      }
      const json = await res.json();
      alert('PDF generated and uploaded: ' + (json.path || 'uploaded'));
      // close the preview window after a short delay
      setTimeout(() => window.close(), 1200);
    } catch (err) {
      console.error('generateAndUpload error:', err);
      alert('Auto PDF generation/upload failed: ' + (err.message || err));
    }
  }

  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', run);
  else run();
})();

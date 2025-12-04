// Get form elements
const form = document.getElementById('dealForm');
const status = document.createElement('div');
status.id = 'app-status';
status.style.padding = '8px';
status.style.margin = '8px 0';
status.style.background = '#fffbdd';
status.style.border = '1px solid #ffd24d';
status.style.borderRadius = '4px';
status.textContent = 'Ready.';
document.body.insertBefore(status, document.body.firstChild);

function setStatus(msg, isError = false) {
  status.textContent = msg;
  status.style.background = isError ? '#ffecec' : '#fffbdd';
  if (isError) console.error(msg);
  else console.log(msg);
}

// Loan number generation (6-digit random numeric)
function generateLoanNumber() {
  // Generate a random 6-digit number (100000-999999)
  return Math.floor(100000 + Math.random() * 900000).toString();
}

const genBtn = document.getElementById('genLoanBtn');
if (genBtn) {
  genBtn.addEventListener('click', () => {
    const input = document.querySelector('input[name="loanNumber"]');
    if (!input) return;
    input.value = generateLoanNumber();
    setStatus(`Loan # generated: ${input.value}`);
  });
}

// Check if editing existing deal
let currentDealId = null;
let existingDealData = null; // Store loaded deal data to preserve on save
const urlParams = new URLSearchParams(window.location.search);
const editId = urlParams.get('id');

// Auto-generate loan number on first load if empty (only for new deals)
window.addEventListener('DOMContentLoaded', async () => {
  const input = document.querySelector('input[name="loanNumber"]');
  
  // If editing, load the deal data
  if (editId) {
    try {
      setStatus('Loading deal...');
      const res = await fetch(`/api/deals/${editId}`);
      const deal = await res.json();
      currentDealId = deal.id;
      existingDealData = deal; // Store for later use
      
      // Populate form fields
      document.querySelector('input[name="loanNumber"]').value = deal.loanNumber || '';
      document.querySelector('input[name="amount"]').value = deal.amount || '';
      document.querySelector('input[name="rateType"]').value = deal.rateType || '';
      document.querySelector('input[name="term"]').value = deal.term || '';
      document.querySelector('input[name="monthlyReturn"]').value = deal.monthlyReturn || '';
      document.querySelector('input[name="ltv"]').value = deal.ltv || '';
      document.querySelector('input[name="address"]').value = deal.address || '';
      document.querySelector('input[name="appraisal"]').value = deal.appraisal || '';
      document.querySelector('input[name="rent"]').value = deal.rent || '';
      document.querySelector('input[name="sqft"]').value = deal.sqft || '';
      document.querySelector('input[name="bedsBaths"]').value = deal.bedsBaths || '';
      document.querySelector('input[name="marketLocation"]').value = deal.marketLocation || '';
      document.querySelector('textarea[name="marketOverview"]').value = deal.marketOverview || '';
      document.querySelector('textarea[name="dealInformation"]').value = deal.dealInformation || '';
      
      // Load images as thumbnails if they exist
      ['hero', 'int1', 'int2', 'int3', 'int4'].forEach(name => {
        const imgData = deal[`${name}Image`];
        if (imgData) {
          const img = document.getElementById(`thumb-${name}`);
          if (img) {
            img.src = imgData;
            img.style.display = 'block';
            img.style.maxWidth = '100%';
            img.style.maxHeight = '200px';
            img.style.width = 'auto';
            img.style.height = 'auto';
          }
        }
      });
      
      // Display attached PDF filenames if they exist
      if (deal.attachedPdf) {
        try {
          const pdfUrls = JSON.parse(deal.attachedPdf);
          const display = document.getElementById('pdf-filename-display');
          if (display && Array.isArray(pdfUrls) && pdfUrls.length > 0) {
            display.textContent = `${pdfUrls.length} PDF(s) attached`;
          }
        } catch (e) {
          console.warn('Error parsing attached PDFs', e);
        }
      }
      
      setStatus(`Editing deal #${deal.loanNumber}`);
    } catch (err) {
      setStatus('Failed to load deal: ' + err.message, true);
    }
  } else if (input && !input.value) {
    // New deal - auto-generate loan number
    input.value = generateLoanNumber();
    setStatus(`Loan # auto-generated: ${input.value}`);
  }
});

// Thumbnail previews for selected image files
function attachThumbPreview(inputName, thumbId) {
  const input = document.querySelector(`input[name="${inputName}"]`);
  const img = document.getElementById(thumbId);
  if (!input || !img) return;
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file) { img.src = ''; img.style.display = 'none'; return; }
    if (!file.type.startsWith('image/')) { img.src = ''; img.style.display = 'none'; return; }
    // Enforce max file size (5MB)
    const MAX = 5 * 1024 * 1024;
    if (file.size > MAX) {
      setStatus(`Selected file too large for ${inputName}: ${(file.size/1024/1024).toFixed(2)} MB (max 5 MB)`, true);
      input.value = '';
      img.src = '';
      img.style.display = 'none';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      img.src = reader.result;
      img.style.display = 'inline-block';
      img.style.maxWidth = '120px';
      img.style.maxHeight = '80px';
      img.style.objectFit = 'cover';
      img.style.margin = '6px 0 12px 6px';
    };
    reader.readAsDataURL(file);
  });
}

['hero','int1','int2','int3','int4'].forEach((name) => attachThumbPreview(name, `thumb-${name}`));

// PDF upload filename display
const pdfInput = document.querySelector('input[name="attachedPdfs"]');
const pdfFilenames = document.getElementById('pdf-upload-filenames');
if (pdfInput && pdfFilenames) {
  pdfInput.addEventListener('change', () => {
    const files = Array.from(pdfInput.files || []);
    if (files.length === 0) {
      pdfFilenames.textContent = '';
    } else {
      pdfFilenames.innerHTML = files.map(f => `<div>• ${f.name}</div>`).join('');
    }
  });
}

// Drag & drop handlers: allow dropping an image onto the .drop-wrap for each slot
function attachDragDrop(name) {
  const wrap = document.querySelector(`.drop-wrap[data-name="${name}"]`);
  if (!wrap) return;
  const input = wrap.querySelector(`input[name="${name}"]`);

  function prevent(e) { e.preventDefault(); e.stopPropagation(); }

  wrap.addEventListener('dragenter', (e) => { prevent(e); wrap.classList.add('dragover'); });
  wrap.addEventListener('dragover', (e) => { prevent(e); wrap.classList.add('dragover'); });
  wrap.addEventListener('dragleave', (e) => { prevent(e); wrap.classList.remove('dragover'); });
  wrap.addEventListener('drop', (e) => {
    prevent(e);
    wrap.classList.remove('dragover');
    const dt = e.dataTransfer;
    if (!dt || !dt.files || !dt.files.length) return;
    const file = dt.files[0];
    if (!file.type.startsWith('image/')) return;
    // set the input.files using DataTransfer
    try {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      input.files = dataTransfer.files;
      // trigger change handler to show thumbnail
      input.dispatchEvent(new Event('change'));
      setStatus(`File attached to ${name}`);
    } catch (err) {
      console.warn('Could not set input.files via DataTransfer', err);
      // fallback: read and set thumbnail only
      const reader = new FileReader();
      reader.onload = () => {
        const img = document.getElementById(`thumb-${name}`);
        if (img) { img.src = reader.result; img.style.display = 'inline-block'; }
      };
      reader.readAsDataURL(file);
    }
  });

  // click the hidden input when user clicks the dropzone
  const label = wrap.querySelector('.dropzone');
  if (label) label.addEventListener('click', (e) => {
    // if user clicked the label area (not the input), trigger file picker
    const target = e.target;
    if (target.tagName.toLowerCase() !== 'input') {
      const fileInput = wrap.querySelector('input[type=file]');
      if (fileInput) fileInput.click();
    }
  });
}

['hero','int1','int2','int3','int4'].forEach((name) => attachDragDrop(name));

// Helper function to collect form data with images
async function collectFormData() {
  const fd = new FormData(form);
  const data = Object.fromEntries(fd.entries());

  // Helper: convert and compress image File to data URL
  async function fileToDataUrl(file, maxWidth = 1200, quality = 0.85) {
    if (!file || !file.size) return null;
    if (!file.type.startsWith('image/')) {
      // For non-images (like PDFs), just read as-is
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }
    
    return await new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();
      
      reader.onload = (e) => {
        img.onload = () => {
          // Calculate new dimensions
          let width = img.width;
          let height = img.height;
          
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }
          
          // Create canvas and compress
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          
          // Convert to compressed data URL
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Include image data URLs for photo slots if files were selected
  const imageSlots = ['hero', 'int1', 'int2', 'int3', 'int4'];
  for (const name of imageSlots) {
    const file = fd.get(name);
    if (file && file instanceof File && file.size) {
      // New file uploaded - use it
      try {
        const url = await fileToDataUrl(file);
        if (url) {
          data[name] = url; // For preview compatibility
        }
      } catch (e) {
        console.warn('Failed to read file for', name, e);
      }
    } else if (existingDealData && existingDealData[`${name}Image`]) {
      // No new file - preserve existing from database
      data[name] = existingDealData[`${name}Image`];
    }
  }

  // Attach multiple PDFs as data URLs if present
  const pdfFiles = fd.getAll('attachedPdfs');
  const pdfDataUrls = [];
  
  // Check if new PDFs were uploaded
  const hasNewPdfs = pdfFiles.some(f => f instanceof File && f.size > 0);
  
  console.log('📎 PDF Collection:', {
    hasExistingData: !!existingDealData,
    hasExistingPdfs: !!(existingDealData && existingDealData.attachedPdf),
    newFilesCount: pdfFiles.length,
    hasNewPdfs: hasNewPdfs
  });
  
  if (hasNewPdfs) {
    // New PDFs uploaded - REPLACE existing ones
    console.log('  📄 New PDFs uploaded - replacing existing');
    for (const pdfFile of pdfFiles) {
      if (pdfFile && pdfFile instanceof File && pdfFile.size) {
        try {
          const url = await fileToDataUrl(pdfFile);
          if (url) {
            console.log(`  Adding new PDF: ${pdfFile.name}`);
            pdfDataUrls.push(url);
          }
        } catch (e) {
          console.warn('Failed to read attached PDF', e);
        }
      }
    }
  } else if (existingDealData && existingDealData.attachedPdf) {
    // No new PDFs - preserve existing ones
    try {
      const existingPdfs = JSON.parse(existingDealData.attachedPdf);
      if (Array.isArray(existingPdfs)) {
        console.log(`  💾 Preserving ${existingPdfs.length} existing PDFs`);
        pdfDataUrls.push(...existingPdfs);
      }
    } catch (e) {
      console.warn('Failed to parse existing PDFs', e);
    }
  }
  
  console.log(`  ✅ Total PDFs to save: ${pdfDataUrls.length}`);
  
  // Include attachedPdf if we have any
  if (pdfDataUrls.length > 0) {
    data.attachedPdf = JSON.stringify(pdfDataUrls);
  }

  return data;
}

// Save Deal Button
document.getElementById('saveBtn').addEventListener('click', async () => {
  setStatus('Saving deal...');
  try {
    const data = await collectFormData();
    
    // Debug logging
    console.log('Saving data:', {
      hasImages: !!(data.hero || data.int1 || data.int2 || data.int3 || data.int4),
      hasPdfs: !!data.attachedPdf,
      pdfCount: data.attachedPdf ? JSON.parse(data.attachedPdf).length : 0
    });
    
    const method = currentDealId ? 'PUT' : 'POST';
    const url = currentDealId ? `/api/deals/${currentDealId}` : '/api/deals';
    
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    const result = await res.json();
    
    if (!res.ok) {
      console.error('Server error:', result);
      throw new Error(result.error || 'Failed to save');
    }
    if (!currentDealId && result.id) {
      currentDealId = result.id;
    }
    
    // Clear PDF input after save
    const pdfInput = document.querySelector('input[name="attachedPdfs"]');
    if (pdfInput) {
      pdfInput.value = '';
      const pdfFilenames = document.getElementById('pdf-upload-filenames');
      if (pdfFilenames) pdfFilenames.innerHTML = '';
    }
    
    // Reload the deal data to show saved PDFs
    if (currentDealId) {
      const reloadRes = await fetch(`/api/deals/${currentDealId}`);
      const reloadedDeal = await reloadRes.json();
      existingDealData = reloadedDeal;
      
      console.log('📊 Reloaded after save:', {
        hasPdfs: !!reloadedDeal.attachedPdf,
        pdfCount: reloadedDeal.attachedPdf ? JSON.parse(reloadedDeal.attachedPdf).length : 0
      });
      
      // Update PDF count display
      if (reloadedDeal.attachedPdf) {
        try {
          const pdfUrls = JSON.parse(reloadedDeal.attachedPdf);
          const display = document.getElementById('pdf-filename-display');
          if (display && Array.isArray(pdfUrls)) {
            display.textContent = `${pdfUrls.length} PDF(s) attached`;
            display.style.color = 'green';
            display.style.fontWeight = 'bold';
          }
        } catch (e) {
          console.error('Failed to update PDF count display:', e);
        }
      }
    }
    
    setStatus('✅ Deal saved successfully!');
  } catch (err) {
    setStatus('Failed to save: ' + err.message, true);
  }
});

// Handle Preview Button — store form data and open the attached template preview
document.getElementById('previewBtn').addEventListener('click', async () => {
  setStatus('Preparing preview...');
  try {
    // Save first if editing, so preview has latest data
    if (currentDealId) {
      setStatus('Saving changes before preview...');
      const data = await collectFormData();
      const res = await fetch(`/api/deals/${currentDealId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) {
        throw new Error('Failed to save before preview');
      }
      
      // Reload the deal data after save to update existingDealData
      const reloadRes = await fetch(`/api/deals/${currentDealId}`);
      if (reloadRes.ok) {
        const reloadedDeal = await reloadRes.json();
        existingDealData = reloadedDeal;
        console.log('Reloaded deal after preview save, has PDFs:', !!reloadedDeal.attachedPdf);
      }
      
      // Open preview with deal ID
      const win = window.open(`/preview/index.html?dealId=${currentDealId}`, '_blank');
      if (!win) {
        setStatus('Popup blocked — please allow popups for this site', true);
        return;
      }
    } else {
      // New deal - try to use sessionStorage with smaller data (no images)
      const data = await collectFormData();
      const previewData = {
        loanNumber: data.loanNumber,
        amount: data.amount,
        rateType: data.rateType,
        term: data.term,
        monthlyReturn: data.monthlyReturn,
        ltv: data.ltv,
        address: data.address,
        appraisal: data.appraisal,
        rent: data.rent,
        sqft: data.sqft,
        bedsBaths: data.bedsBaths,
        marketLocation: data.marketLocation,
        marketOverview: data.marketOverview,
        dealInformation: data.dealInformation
        // Skip images to save space
      };
      sessionStorage.setItem('safeguard_preview', JSON.stringify(previewData));
      const win = window.open('/preview/index.html', '_blank');
      if (!win) {
        setStatus('Popup blocked — please allow popups for this site', true);
        return;
      }
    }
    setStatus('Preview opened in a new window.');
  } catch (err) {
    setStatus('Preview failed: ' + (err.message || err), true);
  }
});

// Handle PDF Generation
document.getElementById('pdfBtn').addEventListener('click', async () => {
  setStatus('Preparing preview for PDF generation...');
  try {
    const data = await collectFormData();
    sessionStorage.setItem('safeguard_preview', JSON.stringify(data));

    const win = window.open('/preview/index.html?autogen=1', '_blank');
    if (!win) {
      setStatus('Popup blocked — please allow popups for this site', true);
      return;
    }
    setStatus('Opened preview for PDF generation. It will auto-generate and upload.');
  } catch (err) {
    setStatus('Failed to prepare PDF preview: ' + (err.message || err), true);
  }
});

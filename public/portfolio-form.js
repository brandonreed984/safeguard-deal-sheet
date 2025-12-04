// Portfolio Form JavaScript
let currentPortfolioId = null;
let loans = [];

// Status element
const status = document.createElement('div');
status.id = 'app-status';
status.style.cssText = 'padding:8px;margin:8px 0;background:#fffbdd;border:1px solid #ffd24d;border-radius:4px;';
status.textContent = 'Ready.';
document.body.insertBefore(status, document.body.firstChild);

function setStatus(msg, isError = false) {
  status.textContent = msg;
  status.style.background = isError ? '#ffecec' : '#fffbdd';
  console.log(msg);
}

// Check if editing existing portfolio
const urlParams = new URLSearchParams(window.location.search);
const editId = urlParams.get('id');

// Load existing portfolio if editing
window.addEventListener('DOMContentLoaded', async () => {
  if (editId) {
    try {
      setStatus('Loading portfolio...');
      const res = await fetch(`/api/portfolios/${editId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load portfolio');
      
      const portfolio = await res.json();
      currentPortfolioId = portfolio.id;
      
      // Populate form
      document.querySelector('input[name="investorName"]').value = portfolio.investorName || '';
      document.querySelector('input[name="currentInvestmentTotal"]').value = portfolio.currentInvestmentTotal || '';
      document.querySelector('input[name="lifetimeInvestmentTotal"]').value = portfolio.lifetimeInvestmentTotal || '';
      document.querySelector('input[name="lifetimeInterestPaid"]').value = portfolio.lifetimeInterestPaid || '';
      
      // Load loans
      loans = JSON.parse(portfolio.loansData || '[]');
      renderLoansTable();
      
      setStatus(`Editing portfolio: ${portfolio.investorName}`);
    } catch (err) {
      setStatus('Failed to load portfolio: ' + err.message, true);
    }
  }
});

// File upload handling
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const uploadStatus = document.getElementById('upload-status');

dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.style.borderColor = '#155291';
  dropZone.style.background = '#e8f2ff';
});

dropZone.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dropZone.style.borderColor = '#1E66B4';
  dropZone.style.background = '#f8f9fa';
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.style.borderColor = '#1E66B4';
  dropZone.style.background = '#f8f9fa';
  
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    handleFile(files[0]);
  }
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    handleFile(e.target.files[0]);
  }
});

async function handleFile(file) {
  uploadStatus.innerHTML = '<div style="color:#1E66B4;">📂 Processing file...</div>';
  
  try {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        
        // Get first sheet
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
        
        parseSpreadsheet(jsonData, file.name);
      } catch (err) {
        uploadStatus.innerHTML = `<div style="color:#dc3545;">❌ Error parsing file: ${err.message}</div>`;
      }
    };
    
    reader.onerror = () => {
      uploadStatus.innerHTML = '<div style="color:#dc3545;">❌ Error reading file</div>';
    };
    
    reader.readAsArrayBuffer(file);
  } catch (err) {
    uploadStatus.innerHTML = `<div style="color:#dc3545;">❌ ${err.message}</div>`;
  }
}

function parseSpreadsheet(data, filename) {
  loans = [];
  let investorName = '';
  let inCurrentSection = false;
  let inPaidOffSection = false;
  
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    
    // Get investor name from first row
    if (i === 0 && row[0]) {
      investorName = row[0].toString().trim();
      document.querySelector('input[name="investorName"]').value = investorName;
    }
    
    // Check for section headers
    if (row[0] && row[0].toString().includes('Address')) {
      inCurrentSection = true;
      inPaidOffSection = false;
      continue;
    }
    
    if (row[0] && row[0].toString().includes('Paid Off')) {
      inCurrentSection = false;
      inPaidOffSection = true;
      continue;
    }
    
    // Skip summary rows
    if (row[0] && (
      row[0].toString().includes('Investment Total') ||
      row[0].toString().includes('Interest Paid')
    )) {
      continue;
    }
    
    // Parse loan rows
    if ((inCurrentSection || inPaidOffSection) && row[0]) {
      const address = row[0];
      const balance = parseFloat(String(row[1] || '0').replace(/[$,]/g, '')) || 0;
      const interestPaid = parseFloat(String(row[2] || '0').replace(/[$,]/g, '')) || 0;
      const status = row[3] || (inPaidOffSection ? 'Paid Off' : 'Current');
      
      if (address && address.toString().trim()) {
        loans.push({
          address: address.toString().trim(),
          balance: balance,
          interestPaid: interestPaid,
          status: status.toString().trim()
        });
      }
    }
  }
  
  renderLoansTable();
  calculateTotals();
  
  uploadStatus.innerHTML = `<div style="color:#28a745;">✅ Loaded ${loans.length} loans from ${filename}</div>`;
  setStatus(`Imported ${loans.length} loans`);
}

function renderLoansTable() {
  const tbody = document.getElementById('loans-tbody');
  
  if (loans.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="padding:40px;text-align:center;color:#999;">
          Upload a spreadsheet or add loans manually
        </td>
      </tr>
    `;
    return;
  }
  
  tbody.innerHTML = loans.map((loan, idx) => `
    <tr style="border-bottom:1px solid #f0f0f0;">
      <td style="padding:10px;">
        <input type="text" value="${loan.address}" onchange="updateLoan(${idx}, 'address', this.value)" 
          style="width:100%;padding:6px;border:1px solid #ddd;border-radius:4px;" />
      </td>
      <td style="padding:10px;">
        <input type="number" step="0.01" value="${loan.balance}" onchange="updateLoan(${idx}, 'balance', parseFloat(this.value) || 0)" 
          style="width:120px;padding:6px;border:1px solid #ddd;border-radius:4px;" />
      </td>
      <td style="padding:10px;">
        <input type="number" step="0.01" value="${loan.interestPaid}" onchange="updateLoan(${idx}, 'interestPaid', parseFloat(this.value) || 0)" 
          style="width:120px;padding:6px;border:1px solid #ddd;border-radius:4px;" />
      </td>
      <td style="padding:10px;">
        <select onchange="updateLoan(${idx}, 'status', this.value)" style="width:100%;padding:6px;border:1px solid #ddd;border-radius:4px;">
          <option value="Current" ${loan.status === 'Current' ? 'selected' : ''}>Current</option>
          <option value="In Default" ${loan.status.includes('Default') ? 'selected' : ''}>In Default</option>
          <option value="Late" ${loan.status === 'Late' ? 'selected' : ''}>Late</option>
          <option value="Paid Off" ${loan.status === 'Paid Off' ? 'selected' : ''}>Paid Off</option>
          <option value="Payoff Pending" ${loan.status.includes('Payoff') && !loan.status.includes('Paid Off') ? 'selected' : ''}>Payoff Pending</option>
        </select>
      </td>
      <td style="padding:10px;text-align:center;">
        <button type="button" onclick="removeLoan(${idx})" style="padding:4px 10px;background:#dc3545;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px;">
          Remove
        </button>
      </td>
    </tr>
  `).join('');
  
  calculateTotals();
}

window.updateLoan = function(idx, field, value) {
  loans[idx][field] = value;
  calculateTotals();
};

window.removeLoan = function(idx) {
  if (confirm('Remove this loan?')) {
    loans.splice(idx, 1);
    renderLoansTable();
  }
};

document.getElementById('add-loan-btn').addEventListener('click', () => {
  loans.push({
    address: '',
    balance: 0,
    interestPaid: 0,
    status: 'Current'
  });
  renderLoansTable();
});

function calculateTotals() {
  const currentInvestment = loans
    .filter(l => l.status !== 'Paid Off')
    .reduce((sum, l) => sum + (parseFloat(l.balance) || 0), 0);
  
  const lifetimeInvestment = loans
    .reduce((sum, l) => sum + (parseFloat(l.balance) || 0), 0);
  
  const lifetimeInterest = loans
    .reduce((sum, l) => sum + (parseFloat(l.interestPaid) || 0), 0);
  
  document.querySelector('input[name="currentInvestmentTotal"]').value = currentInvestment.toFixed(2);
  document.querySelector('input[name="lifetimeInvestmentTotal"]').value = lifetimeInvestment.toFixed(2);
  document.querySelector('input[name="lifetimeInterestPaid"]').value = lifetimeInterest.toFixed(2);
}

// Save Portfolio
document.getElementById('saveBtn').addEventListener('click', async () => {
  setStatus('Saving portfolio...');
  try {
    const investorName = document.querySelector('input[name="investorName"]').value;
    if (!investorName) {
      alert('Please enter investor name');
      return;
    }
    
    if (loans.length === 0) {
      alert('Please add at least one loan');
      return;
    }
    
    const data = {
      investorName,
      loansData: JSON.stringify(loans),
      currentInvestmentTotal: parseFloat(document.querySelector('input[name="currentInvestmentTotal"]').value) || 0,
      lifetimeInvestmentTotal: parseFloat(document.querySelector('input[name="lifetimeInvestmentTotal"]').value) || 0,
      lifetimeInterestPaid: parseFloat(document.querySelector('input[name="lifetimeInterestPaid"]').value) || 0
    };
    
    const method = currentPortfolioId ? 'PUT' : 'POST';
    const url = currentPortfolioId ? `/api/portfolios/${currentPortfolioId}` : '/api/portfolios';
    
    console.log('Saving portfolio:', data);
    
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data)
    });
    
    console.log('Response status:', res.status);
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error('Server error:', errorText);
      throw new Error('Failed to save portfolio: ' + errorText);
    }
    
    const result = await res.json();
    console.log('Save result:', result);
    if (!currentPortfolioId) {
      currentPortfolioId = result.id;
      window.history.replaceState({}, '', `?id=${result.id}`);
    }
    
    setStatus('✅ Portfolio saved successfully!');
    setTimeout(() => setStatus('Ready.'), 2000);
  } catch (err) {
    setStatus('Failed to save: ' + err.message, true);
  }
});

// Preview Portfolio
document.getElementById('previewBtn').addEventListener('click', () => {
  if (!currentPortfolioId) {
    alert('Please save the portfolio first');
    return;
  }
  
  window.open(`/portfolio-preview.html?id=${currentPortfolioId}`, '_blank');
});

// Generate & Download PDF
document.getElementById('pdfBtn').addEventListener('click', async () => {
  if (!currentPortfolioId) {
    alert('Please save the portfolio first');
    return;
  }
  
  setStatus('Generating PDF...');
  try {
    const res = await fetch(`/api/generate-portfolio-pdf/${currentPortfolioId}`, { 
      method: 'POST',
      credentials: 'include'
    });
    console.log('PDF Download - Response status:', res.status);
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error('Server error:', errorText);
      throw new Error(errorText || 'Failed to generate PDF');
    }
    
    const blob = await res.blob();
    console.log('PDF blob received:', blob.type, blob.size, 'bytes');
    
    // Check if blob is valid
    if (blob.size === 0) {
      throw new Error('Generated PDF is empty');
    }
    
    if (blob.type !== 'application/pdf') {
      console.warn('Warning: Content type is', blob.type, 'not application/pdf');
    }
    
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const investorName = document.querySelector('input[name="investorName"]').value;
    a.download = `Portfolio-Review-${investorName.replace(/\s+/g, '-')}.pdf`;
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }, 100);
    
    setStatus('✅ PDF downloaded!');
    setTimeout(() => setStatus('Ready.'), 2000);
  } catch (err) {
    console.error('PDF generation error:', err);
    alert('Failed to generate PDF: ' + err.message);
    setStatus('Failed to generate PDF: ' + err.message, true);
  }
});

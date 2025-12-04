// Portfolio List JavaScript
let portfolios = [];

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

// Load portfolios on page load
window.addEventListener('DOMContentLoaded', loadPortfolios);

// Search functionality
const searchInput = document.getElementById('search');
searchInput.addEventListener('input', debounce(loadPortfolios, 300));

function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

async function loadPortfolios() {
  try {
    setStatus('Loading portfolios...');
    const search = searchInput.value;
    const url = search ? `/api/portfolios?search=${encodeURIComponent(search)}` : '/api/portfolios';
    
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to load portfolios');
    
    portfolios = await res.json();
    renderPortfolios();
    setStatus(`Loaded ${portfolios.length} portfolio(s)`);
  } catch (err) {
    setStatus('Failed to load portfolios: ' + err.message, true);
    console.error(err);
  }
}

function renderPortfolios() {
  const tbody = document.getElementById('portfolios-tbody');
  
  if (portfolios.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="padding:40px;text-align:center;color:#999;">
          No portfolios found. <a href="/portfolio-form.html" style="color:#1E66B4;">Create one</a>
        </td>
      </tr>
    `;
    return;
  }
  
  tbody.innerHTML = portfolios.map(p => {
    const loans = JSON.parse(p.loansData || '[]');
    const loanCount = loans.length;
    const updated = new Date(p.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    
    return `
      <tr style="border-bottom:1px solid #f0f0f0;">
        <td style="padding:12px;">${p.investorName}</td>
        <td style="padding:12px;text-align:right;">$${parseFloat(p.currentInvestmentTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td style="padding:12px;text-align:right;">$${parseFloat(p.lifetimeInvestmentTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td style="padding:12px;text-align:right;">$${parseFloat(p.lifetimeInterestPaid || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td style="padding:12px;text-align:center;">${loanCount}</td>
        <td style="padding:12px;color:#999;">${updated}</td>
        <td style="padding:12px;">
          <button onclick="editPortfolio(${p.id})" style="padding:6px 12px;background:#1E66B4;color:white;border:none;border-radius:4px;cursor:pointer;margin-right:5px;font-size:13px;">
            View/Edit
          </button>
          <button onclick="generatePDF(${p.id}, '${p.investorName.replace(/'/g, "\\'")}'))" style="padding:6px 12px;background:#28a745;color:white;border:none;border-radius:4px;cursor:pointer;margin-right:5px;font-size:13px;">
            Generate PDF
          </button>
          <button onclick="deletePortfolio(${p.id}, '${p.investorName.replace(/'/g, "\\'")}'))" style="padding:6px 12px;background:#dc3545;color:white;border:none;border-radius:4px;cursor:pointer;font-size:13px;">
            Delete
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

window.editPortfolio = function(id) {
  window.location.href = `/portfolio-form.html?id=${id}`;
};

window.generatePDF = async function(id, investorName) {
  try {
    setStatus(`Generating PDF for ${investorName}...`);
    
    const res = await fetch(`/api/generate-portfolio-pdf/${id}`, { method: 'POST' });
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || 'Failed to generate PDF');
    }
    
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Portfolio-Review-${investorName.replace(/\s+/g, '-')}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    setStatus('✅ PDF downloaded!');
    setTimeout(() => setStatus('Ready.'), 2000);
  } catch (err) {
    setStatus('Failed to generate PDF: ' + err.message, true);
  }
};

window.deletePortfolio = async function(id, investorName) {
  if (!confirm(`Delete portfolio for ${investorName}?`)) return;
  
  try {
    setStatus('Deleting...');
    const res = await fetch(`/api/portfolios/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete portfolio');
    
    setStatus('✅ Deleted successfully');
    setTimeout(() => setStatus('Ready.'), 1000);
    loadPortfolios();
  } catch (err) {
    setStatus('Failed to delete: ' + err.message, true);
  }
};

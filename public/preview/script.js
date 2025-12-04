// Safeguard Deal Sheet — PDF generation
document.getElementById('generatePdf').addEventListener('click', async () => {
  const button = document.getElementById('generatePdf');
  const originalText = button.textContent;
  
  try {
    // Get dealId from URL
    const params = new URLSearchParams(window.location.search);
    const dealId = params.get('dealId');
    
    if (!dealId) {
      alert('No deal ID found. Please save the deal first.');
      return;
    }
    
    button.textContent = 'Generating...';
    button.disabled = true;
    
    // Call server endpoint to generate PDF with attached PDFs
    const res = await fetch(`/api/generate-pdf/${dealId}`, { method: 'POST' });
    
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || 'Failed to generate PDF');
    }
    
    // Download the PDF
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deal-${dealId}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    button.textContent = originalText;
    button.disabled = false;
    
  } catch (err) {
    console.error('PDF generation error:', err);
    alert('Failed to generate PDF: ' + err.message);
    button.textContent = originalText;
    button.disabled = false;
  }
});

// Optional: helpers to drop images into the placeholders later
// Example: document.querySelector('.photo.hero').style.backgroundImage = 'url("path/to/your.jpg")'

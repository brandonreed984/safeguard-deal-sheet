// Safeguard Deal Sheet — PDF generation
document.getElementById('generatePdf').addEventListener('click', () => {
  const element = document.getElementById('page');
  const opt = {
    margin: 0,
    filename: 'dealsheet.pdf',
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
  };

  html2pdf().set(opt).from(element).save();
});

// Optional: helpers to drop images into the placeholders later
// Example: document.querySelector('.photo.hero').style.backgroundImage = 'url("path/to/your.jpg")'

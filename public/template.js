// template.js (browser copy)
// Maps form data into the #page layout before PDF export

export async function fillTemplate(formEl) {
  const data = Object.fromEntries(new FormData(formEl).entries());

  // Map form fields to the page placeholders by ID
  const map = {
    loanNumber: '#v-loanNumber',
    amount: '#v-amount',
    rateType: '#v-rateType',
    term: '#v-term',
    monthlyReturn: '#v-monthlyReturn',
    ltv: '#v-ltv',
    address: '#v-address',
    appraisal: '#v-appraisal',
    rent: '#v-rent',
    sqft: '#v-sqft',
    bedsBaths: '#v-bedsBaths',
    marketOverview: '#v-marketOverview',
    marketLocation: '#v-marketLocation',
  };

  Object.entries(map).forEach(([key, selector]) => {
    const el = document.querySelector(selector);
    if (el) el.textContent = data[key] || '';
  });

  // Handle images if present in the form (keeps existing behavior)
  async function fileToDataUrl(file) {
    if (!file || !file.size) return null;
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }

  const fd = new FormData(formEl);
  const imageSlots = [
    ['hero', '#ph-hero'],
    ['int1', '#ph-int1'],
    ['int2', '#ph-int2'],
    ['int3', '#ph-int3'],
    ['int4', '#ph-int4'],
  ];

  for (const [name, selector] of imageSlots) {
    const file = fd.get(name);
    const url = await fileToDataUrl(file);
    const el = document.querySelector(selector);
    if (el) {
      if (url) {
        el.style.backgroundImage = `url("${url}")`;
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = 'center';
      } else {
        el.style.backgroundImage = '';
      }
    }
  }
}

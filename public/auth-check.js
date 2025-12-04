// Auth check - redirects to login if not authenticated
(async function checkAuth() {
  try {
    const response = await fetch('/api/check-auth', {
      credentials: 'include'
    });
    const data = await response.json();
    
    if (!data.authenticated) {
      // Not authenticated, redirect to login
      window.location.href = '/login.html';
    }
  } catch (err) {
    console.error('Auth check failed:', err);
    // On error, redirect to login to be safe
    window.location.href = '/login.html';
  }
})();

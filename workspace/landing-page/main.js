// Kognai Waitlist — POSTs to Cloudflare Worker endpoint
const WAITLIST_API = '/api/waitlist';

const form    = document.getElementById('waitlist-form');
const emailEl  = document.getElementById('waitlist-email');
const walletEl = document.getElementById('waitlist-wallet');
const msgEl    = document.getElementById('waitlist-msg');
const btnEl    = form ? form.querySelector('button[type="submit"]') : null;

if (form) {
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    const email  = (emailEl?.value || '').trim();
    const wallet = (walletEl?.value || '').trim();
    if (!email) return;

    if (btnEl) { btnEl.disabled = true; btnEl.textContent = 'Joining\u2026'; }
    if (msgEl)  { msgEl.textContent = ''; msgEl.className = 'waitlist-note'; }

    try {
      const res  = await fetch(WAITLIST_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, wallet: wallet || undefined }),
      });
      const data = await res.json();

      if (res.ok || data.duplicate) {
        if (msgEl) {
          msgEl.textContent = data.duplicate
            ? 'You\u2019re already in the Founding Circle.'
            : 'Welcome to the Founding Circle. We\u2019ll be in touch.';
          msgEl.className = 'waitlist-note waitlist-success';
        }
        if (emailEl)  emailEl.value  = '';
        if (walletEl) walletEl.value = '';
      } else {
        if (msgEl) {
          msgEl.textContent = data.error || 'Something went wrong. Please try again.';
          msgEl.className = 'waitlist-note waitlist-error';
        }
      }
    } catch {
      // Fallback: store locally if Worker is not yet deployed
      try {
        const waitlist = JSON.parse(localStorage.getItem('kognai_waitlist') || '[]');
        waitlist.push({ email, wallet: wallet || null, timestamp: new Date().toISOString() });
        localStorage.setItem('kognai_waitlist', JSON.stringify(waitlist));
      } catch {}
      if (msgEl) {
        msgEl.textContent = 'Welcome to the Founding Circle. We\u2019ll be in touch.';
        msgEl.className = 'waitlist-note waitlist-success';
      }
      if (emailEl)  emailEl.value  = '';
      if (walletEl) walletEl.value = '';
    } finally {
      if (btnEl) { btnEl.disabled = false; btnEl.textContent = 'Join Waitlist'; }
    }
  });
}

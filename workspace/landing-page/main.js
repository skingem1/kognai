// Waitlist form handler
document.getElementById('waitlist-form').addEventListener('submit', function(e) {
  e.preventDefault();
  var email = document.getElementById('waitlist-email').value;
  var msg = document.getElementById('waitlist-msg');

  // Store locally until backend is wired
  try {
    var waitlist = JSON.parse(localStorage.getItem('kognai_waitlist') || '[]');
    waitlist.push({ email: email, timestamp: new Date().toISOString() });
    localStorage.setItem('kognai_waitlist', JSON.stringify(waitlist));
  } catch (err) { /* localStorage unavailable */ }

  msg.textContent = 'Welcome to the Founding Circle. We\'ll be in touch.';
  document.getElementById('waitlist-email').value = '';
});

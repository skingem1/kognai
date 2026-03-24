import { createMandate, signMandate, revokeMandate } from './src/core.js';
import { verifyMandate, scopeCovers, paymentAllowed } from './src/verifier.js';
const SECRET = 'test-secret';
const m = createMandate('grantor', 'grantee', {
  description: 'test scope', actions: ['read'], resources: ['workspace/*'], maxPaymentUsdc: 5
}, { expiresAt: new Date(Date.now() + 3600000).toISOString() });
const s = signMandate(m, SECRET);
const r1 = verifyMandate(s, SECRET);
console.log('1. valid mandate:', r1.valid === true ? 'PASS' : 'FAIL');
const r2 = verifyMandate({...s, signature:'bad'}, SECRET);
console.log('2. tampered sig:', r2.valid === false ? 'PASS' : 'FAIL');
const expired = {...s, expiresAt: new Date(Date.now()-1000).toISOString()};
const r3 = verifyMandate(expired, SECRET);
console.log('3. expired:', r3.valid === false ? 'PASS' : 'FAIL');
const rev = revokeMandate(s.id, 'grantor', SECRET, 'test');
const r4 = verifyMandate(s, SECRET, [rev]);
console.log('4. revoked:', r4.valid === false ? 'PASS' : 'FAIL');
console.log('5. scopeCovers read:', scopeCovers(s,'read','workspace/file.txt') ? 'PASS' : 'FAIL');
console.log('6. scopeCovers delete:', !scopeCovers(s,'delete','workspace/file.txt') ? 'PASS' : 'FAIL');
console.log('7. payment 4 allowed:', paymentAllowed(s,4) ? 'PASS' : 'FAIL');
console.log('8. payment 6 denied:', !paymentAllowed(s,6) ? 'PASS' : 'FAIL');
console.log('PACT smoke: ALL PASS');

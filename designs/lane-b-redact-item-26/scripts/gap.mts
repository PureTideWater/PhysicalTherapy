const H = await import('/home/user/PhysicalTherapy/packages/redact/src/redact.ts'); const B = await import('/home/user/rev/base/redact.ts'); const C = await import('/home/user/rev/c52/redact.ts');
const claim = [{ claimId: '00000000-0000-4000-8000-000000000001', patientPseudonym: 'synthetic-patient-7', claimNumbers: ['SYN555001'] }];
const who = { pseudonym: 'synthetic-patient-7', names: ['JANE Q VANTREE'], datesOfBirth: ['1961-03-03'], memberIds: ['ZZ1234567'] };
for (const n of [49000, 40000, 30000, 20000]) { const t = `Vantree${' '.repeat(2_000)}x${' J'.repeat(n)}`;
  for (const [k, R] of [['head', H], ['base', B]] as const) { const r = R.redactLetterForScreen(t, who, claim); let lo = 0, hi = 420e6; const held = R.holdsIdentifier(r.text, who, claim, R.checkWorkOf(r));
    // the check's own work: the largest count handed on that still sends
    if (!R.holdsIdentifier(r.text, who, claim, 0)) { while (hi - lo > 1e6) { const mid = (lo + hi) / 2; if (R.holdsIdentifier(r.text, who, claim, mid)) hi = mid; else lo = mid; } }
    console.log(n, k, 'redaction', (R.checkWorkOf(r) / 1e6).toFixed(0), 'check about', ((420e6 - lo) / 1e6).toFixed(0), held ? 'REFUSED' : 'sent', 'replaced', r.replaced); }
  const c = C.redactLetterForScreen(t, who, claim); console.log(n, 'c52 replaced', c.replaced, 'same text as head', c.text === H.redactLetterForScreen(t, who, claim).text, 'same as base', c.text === B.redactLetterForScreen(t, who, claim).text); }

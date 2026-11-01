# sgn-skeptic-0 progress (code-facts lens, 83d71fd6)
- R-01 real=true (weakened): code path true (settle :93-98 recurses to expired :114-116 clearPending). Trigger at +179 s doubtful: setNewPassword returns a fresh Cognito Session / dev challenge (dev-provider.ts:144,89) used at once. But a thrown AssociateSoftwareToken (non-STALE) or any STALE also leaves use:'temporary' after a saved password. Fix sound: write kept email use:'chosen' as soon as the password is saved, before beginTotpSetup.
- R-02 real=true: design specifies no stable node for the link across warning->closed; cheap guard + test.
- R-03 real=true: atPhoneWidth is 390x844 (e2e/a11y.ts:104); region below button; test at short viewport or record.
- R-04 real=true (narrowed): hardware-key/page.tsx:8,13,17 renders SignInNotice with reasonParams (sign-in.ts:254); not in 3.3. Name it; surface wording can be PR 7's.
- R-05 real=true (partly): enroll CardContent flex gap-4 (enroll/page.tsx:24) gives empty region a gap; Alert-box conditional already implied by "when it speaks".
- R-06 real=true: counted(1,'minute') = "1 minute"; design's own digits rule.
- R-07 real=true: 0056:3-5 names amenders; 0077:3 would not name 0081.
- R-08 real=true: loadPublicPage notFound() on bad params (next.ts:123); old task 404s ?reason=restarted.
- R-09 real=true (nit): "under a second" unsupported on full loads on slow phones.
- R-10 real=false: tp_sign_in's Pending already holds the email sealed (sign-in.ts:45-50) with no legal-surface row; legal-surfaces lists non-essential attribution cookie; not new.
- R-11 real=false: pendingSeconds today is a non-exhaustive ternary (pending.ts:14-16); the written-out StepName + compile check is the guard risk row "A step added to Pending later gets no limit" relies on; a derived alias drops it.
- R-12 real=true (nit): dev-provider.test.ts:83-91 hard-codes advance(181); 4.6 omits it; design 4.1 test 4 duplicates.
- R-13 real=true (nit): RefusalTakeover guards on body focus (action-form.tsx:157-160); before hydration a person can tap into Password and ArrivalFocus would take it.
- R-14 real=false: a staff member with a key and no TOTP cannot arise in the app (TOTP always precedes key; no MFA reset in code); the fix would drop the marker on active staff with neither.
- R-15 real=true (nit): design :371 says "as the notice's words" but 6.1 never prints the address.
DONE

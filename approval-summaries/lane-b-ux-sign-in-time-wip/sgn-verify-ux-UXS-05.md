# UXS-05 verify (done)
- clone: scratchpad/uxs05-clone at e4e05a0d
- spec: expectCueInView only at :183 (mfa) and :350 (enroll); new-password step (timed, has step-limit sentence, warning tested at :317-322) has no cue-in-view check. Confirmed.
- design 4.4 scopes the assertion to e2e tests 1 and 3 only, but SGN-02 ("stays in view on a phone with its keyboard up") covers every timed step incl. new-password -> coverage gap real.
- layout estimate from 390 shot: sentence-to-second-input ~250 px, no error; likely passes. "Furthest on any step" overstated: enrolment puts setup key between sentence and field.
- worst case is new-password with the error summary (refused submit then warning): ~400+ px; untested, not run.
- verdict: real, nit right; fix good, plus add the error-mismatch state.

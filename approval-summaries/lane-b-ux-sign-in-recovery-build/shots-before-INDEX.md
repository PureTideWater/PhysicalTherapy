# Before shots: UX PR 7 sign-in recovery (base df4daff7)

Taken 2026-11-04 07:11-07:13Z on the base tree (worktree at df4daff7, since removed), fresh prepare and populate (11 passed), synthetic personas only. 51 shots, 0 skipped. Ids are `<route key>.<variant>.<width>`; the after run should use the same TOUR_ONLY (list below) so files match by name. PNGs in `png/`, window-height tiles in `tiles/` (`tiles/index.json`), entries in `shots.json`.

Spec change for this run (copy only, not committed): `sign-in` reason loop gains `locked` (`tour-spec-locked-reason.diff`), so `sign-in.reason-locked.*` exists; the after run needs the same patch or the build-ops spec change.

Not taken on the base (new on the head; record as skipped "a 404 on this ref" or per design 7): `/sign-in/forgot-password` both phases, `sign-in.password-reset*`, and `sign-in-hardware-key.key-step-closed` (UXS-01; its before is the password page, `sign-in.reason-step-expired`).

| Screen | State | Width / theme | File |
| --- | --- | --- | --- |
| /sign-in | default | 1280 light | png/sign-in.default.1280.png |
| /sign-in | default | 1280 dark (tokens only) | png/sign-in.default.1280-dark.png |
| /sign-in | default | 390 light | png/sign-in.default.390.png |
| /sign-in | locked refusal (UX-066 words change) | 1280 light | png/sign-in.error-locked.1280.png |
| /sign-in | locked refusal (UX-066 words change) | 1280 dark (tokens only) | png/sign-in.error-locked.1280-dark.png |
| /sign-in | locked refusal (UX-066 words change) | 390 light | png/sign-in.error-locked.390.png |
| /sign-in | one wrong password (refusal) | 1280 light | png/sign-in.error-wrong-password.1280.png |
| /sign-in | one wrong password (refusal) | 1280 dark (tokens only) | png/sign-in.error-wrong-password.1280-dark.png |
| /sign-in | one wrong password (refusal) | 390 light | png/sign-in.error-wrong-password.390.png |
| /sign-in | pending submit, held and aborted | 1280 light | png/sign-in.loading.1280.png |
| /sign-in | pending submit, held and aborted | 1280 dark (tokens only) | png/sign-in.loading.1280-dark.png |
| /sign-in | pending submit, held and aborted | 390 light | png/sign-in.loading.390.png |
| /sign-in | ?reason=idle notice | 1280 light | png/sign-in.reason-idle.1280.png |
| /sign-in | ?reason=idle notice | 1280 dark (tokens only) | png/sign-in.reason-idle.1280-dark.png |
| /sign-in | ?reason=idle notice | 390 light | png/sign-in.reason-idle.390.png |
| /sign-in | ?reason=locked notice (the locked notice; D-4 words change) | 1280 light | png/sign-in.reason-locked.1280.png |
| /sign-in | ?reason=locked notice (the locked notice; D-4 words change) | 1280 dark (tokens only) | png/sign-in.reason-locked.1280-dark.png |
| /sign-in | ?reason=locked notice (the locked notice; D-4 words change) | 390 light | png/sign-in.reason-locked.390.png |
| /sign-in | ?reason=restarted notice | 1280 light | png/sign-in.reason-restarted.1280.png |
| /sign-in | ?reason=restarted notice | 1280 dark (tokens only) | png/sign-in.reason-restarted.1280-dark.png |
| /sign-in | ?reason=restarted notice | 390 light | png/sign-in.reason-restarted.390.png |
| /sign-in | ?reason=step_expired notice | 1280 light | png/sign-in.reason-step-expired.1280.png |
| /sign-in | ?reason=step_expired notice | 1280 dark (tokens only) | png/sign-in.reason-step-expired.1280-dark.png |
| /sign-in | ?reason=step_expired notice | 390 light | png/sign-in.reason-step-expired.390.png |
| /sign-in/mfa | default | 1280 light | png/sign-in-mfa.default.1280.png |
| /sign-in/mfa | default | 1280 dark (tokens only) | png/sign-in-mfa.default.1280-dark.png |
| /sign-in/mfa | default | 390 light | png/sign-in-mfa.default.390.png |
| /sign-in/mfa | wrong code (refusal) | 1280 light | png/sign-in-mfa.error.1280.png |
| /sign-in/mfa | wrong code (refusal) | 1280 dark (tokens only) | png/sign-in-mfa.error.1280-dark.png |
| /sign-in/mfa | wrong code (refusal) | 390 light | png/sign-in-mfa.error.390.png |
| /sign-in/mfa | pending submit, held and aborted | 1280 light | png/sign-in-mfa.loading.1280.png |
| /sign-in/mfa | pending submit, held and aborted | 1280 dark (tokens only) | png/sign-in-mfa.loading.1280-dark.png |
| /sign-in/mfa | pending submit, held and aborted | 390 light | png/sign-in-mfa.loading.390.png |
| /sign-in/hardware-key | default | 1280 light | png/sign-in-hardware-key.default.1280.png |
| /sign-in/hardware-key | default | 1280 dark (tokens only) | png/sign-in-hardware-key.default.1280-dark.png |
| /sign-in/hardware-key | default | 390 light | png/sign-in-hardware-key.default.390.png |
| /sign-in/hardware-key | locked refusal (UX-066 words change) | 1280 light | png/sign-in-hardware-key.error-locked.1280.png |
| /sign-in/hardware-key | locked refusal (UX-066 words change) | 1280 dark (tokens only) | png/sign-in-hardware-key.error-locked.1280-dark.png |
| /sign-in/hardware-key | locked refusal (UX-066 words change) | 390 light | png/sign-in-hardware-key.error-locked.390.png |
| /sign-in/hardware-key | pending submit, held and aborted | 1280 light | png/sign-in-hardware-key.loading.1280.png |
| /sign-in/hardware-key | pending submit, held and aborted | 1280 dark (tokens only) | png/sign-in-hardware-key.loading.1280-dark.png |
| /sign-in/hardware-key | pending submit, held and aborted | 390 light | png/sign-in-hardware-key.loading.390.png |
| /sign-in/hardware-key | ?reason=hardware_key_required notice | 1280 light | png/sign-in-hardware-key.reason-hardware-key-required.1280.png |
| /sign-in/hardware-key | ?reason=hardware_key_required notice | 1280 dark (tokens only) | png/sign-in-hardware-key.reason-hardware-key-required.1280-dark.png |
| /sign-in/hardware-key | ?reason=hardware_key_required notice | 390 light | png/sign-in-hardware-key.reason-hardware-key-required.390.png |
| /sign-in/hardware-key | ?reason=key_registered notice | 1280 light | png/sign-in-hardware-key.reason-key-registered.1280.png |
| /sign-in/hardware-key | ?reason=key_registered notice | 1280 dark (tokens only) | png/sign-in-hardware-key.reason-key-registered.1280-dark.png |
| /sign-in/hardware-key | ?reason=key_registered notice | 390 light | png/sign-in-hardware-key.reason-key-registered.390.png |
| /sign-in/hardware-key | ?reason=step_expired notice | 1280 light | png/sign-in-hardware-key.reason-step-expired.1280.png |
| /sign-in/hardware-key | ?reason=step_expired notice | 1280 dark (tokens only) | png/sign-in-hardware-key.reason-step-expired.1280-dark.png |
| /sign-in/hardware-key | ?reason=step_expired notice | 390 light | png/sign-in-hardware-key.reason-step-expired.390.png |

TOUR_ONLY: `sign-in.default.1280,sign-in.default.1280-dark,sign-in.default.390,sign-in.reason-locked.1280,sign-in.reason-locked.1280-dark,sign-in.reason-locked.390,sign-in.reason-idle.1280,sign-in.reason-idle.1280-dark,sign-in.reason-idle.390,sign-in.reason-step-expired.1280,sign-in.reason-step-expired.1280-dark,sign-in.reason-step-expired.390,sign-in.reason-restarted.1280,sign-in.reason-restarted.1280-dark,sign-in.reason-restarted.390,sign-in.error-wrong-password.1280,sign-in.error-wrong-password.1280-dark,sign-in.error-wrong-password.390,sign-in.error-locked.1280,sign-in.error-locked.1280-dark,sign-in.error-locked.390,sign-in.loading.1280,sign-in.loading.1280-dark,sign-in.loading.390,sign-in-mfa.default.1280,sign-in-mfa.default.1280-dark,sign-in-mfa.default.390,sign-in-mfa.error.1280,sign-in-mfa.error.1280-dark,sign-in-mfa.error.390,sign-in-mfa.loading.1280,sign-in-mfa.loading.1280-dark,sign-in-mfa.loading.390,sign-in-hardware-key.default.1280,sign-in-hardware-key.default.1280-dark,sign-in-hardware-key.default.390,sign-in-hardware-key.reason-step-expired.1280,sign-in-hardware-key.reason-step-expired.1280-dark,sign-in-hardware-key.reason-step-expired.390,sign-in-hardware-key.reason-hardware-key-required.1280,sign-in-hardware-key.reason-hardware-key-required.1280-dark,sign-in-hardware-key.reason-hardware-key-required.390,sign-in-hardware-key.reason-key-registered.1280,sign-in-hardware-key.reason-key-registered.1280-dark,sign-in-hardware-key.reason-key-registered.390,sign-in-hardware-key.error-locked.1280,sign-in-hardware-key.error-locked.1280-dark,sign-in-hardware-key.error-locked.390,sign-in-hardware-key.loading.1280,sign-in-hardware-key.loading.1280-dark,sign-in-hardware-key.loading.390`

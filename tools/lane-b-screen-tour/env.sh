# Shared environment for the screen capture (synthetic e2e database only).
export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH
export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
export NEXT_TELEMETRY_DISABLED=1
export E2E_DATABASE=tp_e2e_screens
export E2E_PORT=3297
export E2E_ADMIN_URL=postgres://postgres:test@localhost:5433/postgres
D=/tmp/tp-e2e-tp_e2e_screens
server_env() {
  env E2E_ADMIN_URL=$E2E_ADMIN_URL \
    DATABASE_URL=postgres://tp_app_dev:tp_app_dev@localhost:5433/tp_e2e_screens \
    BILLING_DATABASE_URL=postgres://tp_billing_dev:tp_billing_dev@localhost:5433/tp_e2e_screens \
    ESIGN_DATABASE_URL=postgres://tp_esign_dev:tp_esign_dev@localhost:5433/tp_e2e_screens \
    APP_ORIGIN=http://localhost:3297 \
    TP_ALLOW_LOCAL_PROVIDERS=e2e TP_AUTH_PROVIDER=dev TP_DEV_AUTH_DIR=$D-dev-auth \
    TP_KEY_PROVIDER=local TP_LOCAL_MASTER_KEY="${TP_LOCAL_MASTER_KEY:?set it to the development master key apps/web/playwright.config.ts gives the e2e server (developmentMasterKey in apps/web/src/lib/server/config.ts)}" \
    AUTH_COOKIE_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))") \
    BILLING_PROVIDER=local BILLING_LOCAL_DIR=$D-billing \
    DOCUMENTS_DIR=$D-documents QUEUE_DATABASE_URL=postgres://postgres:test@localhost:5433/tp_e2e_screens \
    MODEL_PROVIDER=local MODEL_LOCAL_FIXTURES_DIR=$D-model-outputs \
    ESIGN_PROVIDER=local ESIGN_LOCAL_SECRET=synthetic-e2e-esign-webhook-secret ESIGN_LOCAL_DIR=$D-esign \
    AGREEMENTS_DIR=$D-agreements COMPLIANCE_EXPORT_DIR=$D-compliance \
    "$@"
}

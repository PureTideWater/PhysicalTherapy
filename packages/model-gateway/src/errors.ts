/**
 * Why the gateway refused or could not finish a call. Messages are fixed sentences with codes: they
 * never carry a document's text, an identifier or a model's output, so they can be logged and shown.
 */

export class GatewayError extends Error {
  override readonly name: string = 'GatewayError';

  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const FEATURE_OFF_MESSAGES = {
  kill_switch: 'model features are switched off; enter the record by hand',
  feature_off: 'this model feature is not turned on for the practice',
  not_evaluated: 'this model feature has not passed its evaluation for the configured model; enter the record by hand',
} as const;

/**
 * The kill switch is on, the purpose's own flag is off, or (`not_evaluated`) the feature, or the variant the
 * call asks for, has not passed its evaluation for the configured provider and model (./evaluated.ts;
 * docs/adr/0070, Part 2): the product works on hand-entered records.
 */
export class ModelFeatureOffError extends GatewayError {
  override readonly name = 'ModelFeatureOffError';

  constructor(readonly reason: keyof typeof FEATURE_OFF_MESSAGES) {
    super(reason, FEATURE_OFF_MESSAGES[reason]);
  }
}

/** The practice has spent its daily model budget (test matrix MOD-05). */
export class ModelBudgetExceededError extends GatewayError {
  override readonly name = 'ModelBudgetExceededError';

  constructor() {
    super('budget_exceeded', 'the practice has spent its daily model budget; the call was refused');
  }
}

/** The process, or the practice, already has as many calls in flight as it may (limiter.ts); nothing was sent. */
export class ModelBusyError extends GatewayError {
  override readonly name = 'ModelBusyError';

  constructor() {
    super('busy', 'other model calls are in flight on this server; nothing was sent, so try again in a minute or enter the record by hand');
  }
}

/** A practice's material would leave for a model from somewhere other than production (PRD 14, PHI minimization). */
export class PhiBoundaryError extends GatewayError {
  override readonly name = 'PhiBoundaryError';

  constructor() {
    super('phi_boundary', 'a practice’s records reach a model only from production; use the local provider or a synthetic evaluation call');
  }
}

/** What the gateway would send breaks a minimization rule: more than one patient, or an identifier that must not be sent. */
export class InputRefusedError extends GatewayError {
  override readonly name = 'InputRefusedError';
}

/** A completed call under the same idempotency key is already logged: a replay makes no second call. */
export class DuplicateModelCallError extends GatewayError {
  override readonly name = 'DuplicateModelCallError';

  constructor(readonly modelCallId: string) {
    super('already_called', 'this call was already made under the same request key; its log row is kept and no second call is made');
  }
}

/** The provider failed (after the one retry where a retry was allowed); the failed call is logged. */
export class ModelCallFailedError extends GatewayError {
  override readonly name = 'ModelCallFailedError';

  constructor(
    code: string,
    readonly modelCallId: string,
  ) {
    super(code, `the model call failed (${code}); nothing was proposed`);
  }
}

/** The gateway's configuration is incomplete or names an implementation the environment refuses. */
export class GatewayConfigError extends Error {
  override readonly name = 'GatewayConfigError';
}

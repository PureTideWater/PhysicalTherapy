import { randomUUID } from 'node:crypto';

import type { BillingProvider } from '@tp/billing';
import { DirectorySimulatorStore, LocalBillingProvider, MemorySimulatorStore, type SimulatorStore } from '@tp/billing/local';
import { StripeBillingProvider, stripeClient } from '@tp/billing/stripe';
import { type BillingPool, receiveWebhook } from '@tp/worker/billing';

import type { BillingSettings } from './config';

/**
 * The billing provider a server runs with (docs/adr/0050): Stripe, whose events arrive at the webhook route;
 * or the local simulator, whose events are delivered in this process to the same verification and
 * processing the webhook route uses, so the flows dev and the e2e suite run are the ones production runs.
 */
export function billingProvider(settings: BillingSettings, pool: BillingPool): BillingProvider {
  if (settings.kind === 'stripe') {
    return new StripeBillingProvider({ client: stripeClient(settings.secretKey), webhookSecret: settings.webhookSecret, publishableKey: settings.publishableKey });
  }
  return localBillingProvider(new DirectorySimulatorStore(settings.directory), settings.webhookSecret, pool);
}

/** The simulator, its events received in process as the webhook route receives them. */
export function localBillingProvider(store: SimulatorStore, webhookSecret: string, pool: BillingPool): LocalBillingProvider {
  const provider: LocalBillingProvider = new LocalBillingProvider({
    store,
    webhookSecret,
    deliver: async (payload, signature) => {
      await receiveWebhook({ pool, provider }, { payload, signature, requestId: `simulator-${randomUUID()}` });
    },
  });
  return provider;
}

/** Tests: an in-memory simulator delivering to the given pool. */
export function memoryBillingProvider(pool: BillingPool, webhookSecret = 'whsec_tests_in_memory_simulator'): LocalBillingProvider {
  return localBillingProvider(new MemorySimulatorStore(), webhookSecret, pool);
}

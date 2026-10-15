import type { Metadata } from 'next';

import { ScreenPlaceholder } from '../../../components/screen-placeholder';

export const metadata: Metadata = { title: 'Pricing runs' };

export default function PricingRunsPage() {
  return <ScreenPlaceholder slug="pricing-runs" />;
}

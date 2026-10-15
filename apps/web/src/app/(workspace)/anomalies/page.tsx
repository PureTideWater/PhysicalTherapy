import type { Metadata } from 'next';

import { ScreenPlaceholder } from '../../../components/screen-placeholder';

export const metadata: Metadata = { title: 'Anomalies' };

export default function AnomaliesPage() {
  return <ScreenPlaceholder slug="anomalies" />;
}

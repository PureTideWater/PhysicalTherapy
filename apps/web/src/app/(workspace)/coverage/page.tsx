import type { Metadata } from 'next';

import { ScreenPlaceholder } from '../../../components/screen-placeholder';

export const metadata: Metadata = { title: 'Coverage' };

export default function CoveragePage() {
  return <ScreenPlaceholder slug="coverage" />;
}

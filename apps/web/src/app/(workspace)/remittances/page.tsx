import type { Metadata } from 'next';

import { ScreenPlaceholder } from '../../../components/screen-placeholder';

export const metadata: Metadata = { title: 'Remittances' };

export default function RemittancesPage() {
  return <ScreenPlaceholder slug="remittances" />;
}

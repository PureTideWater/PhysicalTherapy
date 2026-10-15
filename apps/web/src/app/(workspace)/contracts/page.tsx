import type { Metadata } from 'next';

import { ScreenPlaceholder } from '../../../components/screen-placeholder';

export const metadata: Metadata = { title: 'Contracts' };

export default function ContractsPage() {
  return <ScreenPlaceholder slug="contracts" />;
}

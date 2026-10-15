import type { Metadata } from 'next';

import { ScreenPlaceholder } from '../../../components/screen-placeholder';

export const metadata: Metadata = { title: 'Reports' };

export default function ReportsPage() {
  return <ScreenPlaceholder slug="reports" />;
}

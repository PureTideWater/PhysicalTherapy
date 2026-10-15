import type { Metadata } from 'next';

import { ScreenPlaceholder } from '../../../components/screen-placeholder';

export const metadata: Metadata = { title: 'Practice dashboard' };

export default function DashboardPage() {
  return <ScreenPlaceholder slug="dashboard" />;
}

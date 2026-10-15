import type { Metadata } from 'next';

import { ScreenPlaceholder } from '../../../components/screen-placeholder';

export const metadata: Metadata = { title: 'Submissions and responses' };

export default function SubmissionsPage() {
  return <ScreenPlaceholder slug="submissions" />;
}

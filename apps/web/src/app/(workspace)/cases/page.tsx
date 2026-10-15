import type { Metadata } from 'next';

import { ScreenPlaceholder } from '../../../components/screen-placeholder';

export const metadata: Metadata = { title: 'Cases' };

export default function CasesPage() {
  return <ScreenPlaceholder slug="cases" />;
}

import type { Metadata } from 'next';

import { ScreenPlaceholder } from '../../../components/screen-placeholder';

export const metadata: Metadata = { title: 'Packet builder' };

export default function PacketsPage() {
  return <ScreenPlaceholder slug="packets" />;
}

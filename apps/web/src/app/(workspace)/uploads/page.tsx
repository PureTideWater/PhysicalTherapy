import type { Metadata } from 'next';

import { ScreenPlaceholder } from '../../../components/screen-placeholder';

export const metadata: Metadata = { title: 'Uploads' };

export default function UploadsPage() {
  return <ScreenPlaceholder slug="uploads" />;
}

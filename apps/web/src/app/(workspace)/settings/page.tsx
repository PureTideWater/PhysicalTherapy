import type { Metadata } from 'next';

import { ScreenPlaceholder } from '../../../components/screen-placeholder';

export const metadata: Metadata = { title: 'Settings' };

export default function SettingsPage() {
  return <ScreenPlaceholder slug="settings" />;
}

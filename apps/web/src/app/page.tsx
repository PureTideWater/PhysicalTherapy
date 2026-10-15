import { redirect } from 'next/navigation';

import { screenHref } from '../lib/screens';

export default function Home(): never {
  redirect(screenHref('dashboard'));
}

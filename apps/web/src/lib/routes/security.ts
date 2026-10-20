import { z } from 'zod';

import { publicRoute } from '../http/invoke';
import type { TextDocument } from '../http/route';
import { DISCLOSURE_PATH, SECURITY_TXT_EXPIRES, SECURITY_TXT_PATH, securityTxt } from '../security/disclosure';

/**
 * The product's security contact (audit item #20 (f)): /.well-known/security.txt (RFC 9116) and the public
 * vulnerability-disclosure page it names as its policy. Both are public and read only the server's configuration:
 * no session, no database, no PHI, and no form, so they answer even while the database or the platform is down.
 */

export const securityTxtFile = publicRoute({
  id: 'public.security_txt',
  kind: 'handler',
  path: SECURITY_TXT_PATH,
  phi: false,
  params: z.object({}),
  handle: ({ services }): Promise<TextDocument> =>
    Promise.resolve({ text: { contentType: 'text/plain; charset=utf-8', body: securityTxt({ origin: services.origin, contact: services.securityEmail, expires: SECURITY_TXT_EXPIRES }) } }),
  sample: { params: () => ({}) },
});

export interface DisclosurePageData {
  readonly securityEmail: string;
  readonly securityTxtPath: string;
}

export const disclosurePage = publicRoute({
  id: 'public.security',
  kind: 'page',
  path: DISCLOSURE_PATH,
  phi: false,
  params: z.object({}),
  handle: ({ services }): Promise<DisclosurePageData> => Promise.resolve({ securityEmail: services.securityEmail, securityTxtPath: SECURITY_TXT_PATH }),
  sample: { params: () => ({}) },
});

export const SECURITY_ROUTES = [securityTxtFile, disclosurePage] as const;

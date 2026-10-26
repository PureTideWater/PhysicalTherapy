-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- marketing_channel(text,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: b07290ad9961ab28
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.marketing_channel(utm_medium text, paid_click text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  SELECT CASE WHEN m.channel IN ('none', 'other') AND paid_click IN ('paid_search', 'paid_social') THEN paid_click ELSE m.channel END
    FROM (SELECT CASE
                   WHEN utm_medium IS NULL THEN 'none'
                   WHEN utm_medium IN ('email', 'newsletter') THEN 'email'
                   WHEN utm_medium IN ('cpc', 'ppc', 'paid_search', 'sem') THEN 'paid_search'
                   WHEN utm_medium IN ('paid_social') THEN 'paid_social'
                   WHEN utm_medium IN ('social', 'organic_social', 'linkedin') THEN 'social'
                   WHEN utm_medium IN ('partner', 'referral', 'affiliate') THEN 'partner'
                   WHEN utm_medium IN ('event', 'conference', 'webinar') THEN 'event'
                   WHEN utm_medium IN ('content', 'blog', 'podcast', 'article') THEN 'content'
                   ELSE 'other'
                 END AS channel) m
$function$;
ALTER FUNCTION public.marketing_channel(text,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.marketing_channel(text,text) FROM PUBLIC;

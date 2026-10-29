-- Global media policy. Only the server's service key may read or update this singleton.
CREATE TABLE public.site_asset_config (
  id text PRIMARY KEY CHECK (id = 'global'),
  asset_source_mode text NOT NULL DEFAULT 'local_only' CHECK (asset_source_mode IN ('local_only','cloud_first')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0 AND version <= 9007199254740991),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.site_asset_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_asset_config FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, UPDATE ON public.site_asset_config TO service_role;
INSERT INTO public.site_asset_config(id,asset_source_mode) VALUES ('global','local_only');

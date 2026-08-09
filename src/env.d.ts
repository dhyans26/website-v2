/// <reference types="astro/client" />

interface ImportMetaEnv {
    /**
     * Cloudflare Web Analytics beacon token. Set in the host's env vars.
     * Only read during production builds — see BaseLayout.astro.
     */
    readonly PUBLIC_CF_BEACON_TOKEN?: string;
}

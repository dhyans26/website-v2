/// <reference types="astro/client" />

interface ImportMetaEnv {
    /**
     * Cloudflare Web Analytics beacon token. Set in the host's env vars.
     * Only read during production builds — see BaseLayout.astro.
     */
    readonly PUBLIC_CF_BEACON_TOKEN?: string;

    /**
     * Optional GitHub PAT. Only raises the build-time API rate limit
     * (60/hr unauthenticated → 5000/hr). Never sent to the client — the
     * missing PUBLIC_ prefix is deliberate.
     */
    readonly GITHUB_TOKEN?: string;
}

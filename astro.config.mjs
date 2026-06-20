// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
    // Canonical origin — used for the sitemap, RSS feed, and canonical/OG URLs.
    site: 'https://dhyans.dev',

    integrations: [sitemap()],

    // Minify HTML output
    compressHTML: true,

    build: {
        // Inline stylesheets smaller than 4KB directly into HTML — fewer requests
        inlineStylesheets: 'auto',
    },

    vite: {
        plugins: [tailwindcss()],
        build: {
            // Raise the chunk warning threshold a bit (fonts push it over default)
            chunkSizeWarningLimit: 600,
        },
    },
});

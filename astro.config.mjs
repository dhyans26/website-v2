// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import { buildTechIcons } from './scripts/build-tech-icons.mjs';

// Regenerates public/tech/*.svg from tech.yaml before Astro reads public/.
// Those files are gitignored, so this has to run on both dev and build —
// config:setup fires for both.
function techIcons() {
    return {
        name: 'tech-icons',
        hooks: {
            'astro:config:setup': () => buildTechIcons(),
        },
    };
}

export default defineConfig({
    integrations: [techIcons()],

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

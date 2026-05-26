import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

const GITHUB_PAGES_BASE = '/WhereToNext/'

/** GitHub Pages: https://acidixzz.github.io/WhereToNext/ */
function resolveBase(mode: string): string {
    const raw = process.env.VITE_BASE_PATH?.trim()
    if (raw) return raw.endsWith('/') ? raw : `${raw}/`
    if (mode === 'pages') return GITHUB_PAGES_BASE
    return '/'
}

export default defineConfig(({ mode }) => {
    if (mode === 'pages' && !process.env.VITE_MAPBOX_ACCESS_TOKEN?.trim()) {
        throw new Error(
            'VITE_MAPBOX_ACCESS_TOKEN is required for build:pages. ' +
                'Locally: set it in .env. On GitHub Actions: add repository secret MAPBOX_ACCESS_TOKEN (pk...).',
        )
    }

    return {
    plugins: [tailwindcss()],
    base: resolveBase(mode),
    preview: {
        // npm run preview:pages — open the same URL path as production
        open: mode === 'pages' ? GITHUB_PAGES_BASE : undefined,
    },
    }
})

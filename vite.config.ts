import { defineConfig, loadEnv } from 'vite'
import tailwindcss from '@tailwindcss/vite'

const GITHUB_PAGES_BASE = '/WhereToNext/'

/** GitHub Pages: https://acidixzz.github.io/WhereToNext/ */
function resolveBase(mode: string, env: Record<string, string>): string {
    const raw = env.VITE_BASE_PATH?.trim() || process.env.VITE_BASE_PATH?.trim()
    if (raw) return raw.endsWith('/') ? raw : `${raw}/`
    if (mode === 'pages') return GITHUB_PAGES_BASE
    return '/'
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '')
    const mapboxToken =
        env.VITE_MAPBOX_ACCESS_TOKEN?.trim() ??
        process.env.VITE_MAPBOX_ACCESS_TOKEN?.trim() ??
        ''

    if (mode === 'pages' && !mapboxToken) {
        throw new Error(
            'VITE_MAPBOX_ACCESS_TOKEN is required for build:pages. ' +
                'Add it to .env (see .env.example). On GitHub Actions: repository secret MAPBOX_ACCESS_TOKEN (pk...).',
        )
    }

    const base = resolveBase(mode, env)

    return {
        plugins: [tailwindcss()],
        base,
        preview: {
            // preview:pages — same URL path as GitHub Pages
            open: mode === 'pages' ? GITHUB_PAGES_BASE : '/',
        },
    }
})

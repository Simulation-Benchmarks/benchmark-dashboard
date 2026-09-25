# Benchmark dashboard UI

Vue 3 frontend using PrimeVue, Vite, and Plotly. The API is the FastAPI service in `../app`.

From the repository root, run `make dev` to start both services. The UI is available at http://localhost:4200 and Vite proxies `/api` to http://127.0.0.1:8000.

To work on the UI alone:

```bash
npm --prefix ui ci
npm --prefix ui start
```

Build the production assets with `npm --prefix ui run build`. Output is written to `ui/dist` and copied into the Nginx image by `Containerfile.ui`.

Run `npm --prefix ui run lint` for Vue and TypeScript checks, `npm --prefix ui run format` to apply Prettier, and `npm --prefix ui run format:check` to verify formatting without changing files.

UI components live in `src/components`, with API and data helpers in `src/lib`. The stylesheet entry point is `src/styles.css`; `src/styles/base.css` holds theme and PrimeVue overrides, `src/styles/shared.css` and `src/styles/tables.css` hold reusable UI rules, and the remaining files in `src/styles` match their features.

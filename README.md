# Semantic Benchmark Dashboard

Semantic Benchmark Dashboard displays published benchmark runs from the
production RoHub knowledge graph. It consists of:

- a FastAPI service that queries RoHub, loads benchmark metadata, resolves
  software names through zbMATH Open, and exposes run values and a recent
  SPARQL-query log; and
- an Angular UI built with PrimeNG, AG Grid, and Plotly for browsing,
  filtering, and comparing runs.

The API caches the published-runs response for five minutes. Refreshing the
data from the UI bypasses that cache.

## Configuration

The service requires RoHub credentials to download benchmark metadata. Create
`app/.env` with:

```dotenv
ROHUB_USERNAME=your-rohub-username
ROHUB_PASSWORD=your-rohub-password
```

`app/.env` is ignored by Git. Runtime environment variables take precedence,
and containers can receive the same values with `--env-file app/.env`.

The service also needs outbound HTTPS access to the production RoHub services
and `api.zbmath.org`.

## Local development

Prerequisites:

- Python 3.12 or later
- Node.js and npm

Create the Python environment and install both sets of dependencies:

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
npm --prefix ui install
```

Start the API and Angular development server from the repository root:

```bash
make dev
```

The development services are available at:

- UI: <http://localhost:4200>
- API documentation: <http://localhost:8000/docs>
- API health check: <http://localhost:8000/api/health>

The Angular development server proxies `/api` to the API on port `8000`.
Stopping `make dev` stops both processes.

## Run with Podman

On macOS, initialize and start the Podman virtual machine first if necessary:

```bash
podman machine init
podman machine start
```

Build the API and UI images from the repository root:

```bash
podman build -f Containerfile.service -t semantic-benchmark-service .
podman build -f Containerfile.ui -t semantic-benchmark-ui .
```

Create a private network and start both containers:

```bash
podman network create semantic-benchmark

podman run -d \
  --name service \
  --network semantic-benchmark \
  --env-file app/.env \
  -p 8000:8000 \
  semantic-benchmark-service

podman run -d \
  --name ui \
  --network semantic-benchmark \
  -p 8080:80 \
  semantic-benchmark-ui
```

Open the UI at <http://localhost:8080> or the API documentation at
<http://localhost:8000/docs>. The Nginx server in the UI container proxies
`/api` to `service:8000` over the private network. Set `SERVICE_HOST` and
`SERVICE_PORT` on the UI container to use a different backend address.

Inspect the running containers and their logs with:

```bash
podman ps
podman logs service
podman logs ui
```

After changing either `Containerfile` or application source, rebuild the
images and recreate the containers:

```bash
podman stop ui service
podman rm ui service

podman build -f Containerfile.service -t semantic-benchmark-service .
podman build -f Containerfile.ui -t semantic-benchmark-ui .
```

Then repeat the two `podman run` commands above. The existing network can be
reused.

To remove the local deployment completely:

```bash
podman stop ui service
podman rm ui service
podman network rm semantic-benchmark
```

## Deploy with Quadlets

Rootless systemd Quadlets for the API, UI, and their private network are in
`deployment/quadlets`. They use images from the Universität Stuttgart Harbor
registry and run under the `podman` user. The deployment exposes only loopback
ports:

- UI: <http://127.0.0.1:9060>
- API: <http://127.0.0.1:9050>

See [deployment/quadlets/README.md](deployment/quadlets/README.md) for image
publishing, credential setup, installation, and service-management commands.

## API routes

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Service health check |
| `GET` | `/api/runs` | Published runs; use `?refresh=true` to bypass the cache |
| `GET` | `/api/run-values?run_id=...` | Parameter and metric values for a run |
| `GET` | `/api/sparql-log` | Recent in-process SPARQL executions |
| `DELETE` | `/api/sparql-log` | Clear the SPARQL execution log |

The interactive OpenAPI documentation is available at `/docs`.

## Build verification

This repository does not currently include an automated backend test suite.
Build the production UI with:

```bash
npm --prefix ui run build
```

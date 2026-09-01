# Podman Quadlets

These rootless Quadlets run the API and UI on a private Podman network using
images from the Universität Stuttgart Harbor registry. The API and UI are
bound to the host loopback interface on ports `9050` and `9060`, respectively.

## Build and publish

Log in to the registry, then build and push both `linux/amd64` images from the
repository root:

```bash
podman login cr.tik.uni-stuttgart.de

podman build \
  -f Containerfile.service \
  --platform linux/amd64 \
  -t cr.tik.uni-stuttgart.de/izus-darus/semantic-benchmark/service:latest \
  .

podman build \
  -f Containerfile.ui \
  --platform linux/amd64 \
  -t cr.tik.uni-stuttgart.de/izus-darus/semantic-benchmark/ui:latest \
  .

podman push cr.tik.uni-stuttgart.de/izus-darus/semantic-benchmark/service:latest
podman push cr.tik.uni-stuttgart.de/izus-darus/semantic-benchmark/ui:latest
```

On macOS, start the Podman VM with `podman machine start` before running these
commands.

## Deploy

On the deployment host, authenticate to Harbor so the rootless Podman user can
pull the private images:

```bash
podman login cr.tik.uni-stuttgart.de
podman pull cr.tik.uni-stuttgart.de/izus-darus/semantic-benchmark/service:latest
podman pull cr.tik.uni-stuttgart.de/izus-darus/semantic-benchmark/ui:latest
```

Create `/home/podman/benchmark-dashboard/semantic-benchmark.env` containing:

```dotenv
ROHUB_USERNAME=your-rohub-username
ROHUB_PASSWORD=your-rohub-password
```

Protect the file, then install and start the units:

```bash
chmod 600 /home/podman/benchmark-dashboard/semantic-benchmark.env
podman quadlet install --replace \
  deployment/quadlets/*.network \
  deployment/quadlets/*.container
systemctl --user daemon-reload
systemctl --user start semantic-benchmark-ui.service
```

The UI is then available at <http://127.0.0.1:9060>, and the API at
<http://127.0.0.1:9050>. `Pull=newer` makes Podman check for a newer `latest`
image whenever each service starts.

The `[Install]` sections make the generated services part of the user's
`default.target`, so they start on subsequent logins. Generated Quadlet
services should not be enabled directly with `systemctl enable`.

To keep user services running after logout, an administrator can enable
lingering with `loginctl enable-linger USER`. View logs with:

```bash
journalctl --user -u semantic-benchmark-service.service -u semantic-benchmark-ui.service -f
```

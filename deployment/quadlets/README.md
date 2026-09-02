# Semantic Benchmark Dashboard — Deployment

This deployment uses rootless Podman Quadlets to run the Semantic Benchmark Dashboard API and UI as user services.

## Directory Structure

The Quadlet files are located at:

```text
~/.config/containers/systemd/benchmark-dashboard/
├── semantic-benchmark-network.network
├── semantic-benchmark-service.container
└── semantic-benchmark-ui.container

The API environment file is:

~/benchmark-dashboard/semantic-benchmark.env

## 1. Enter the `podman` User Session

On the server, enter the `podman` user session:

    sudo machinectl shell --uid podman

Verify Podman:

    podman ps

## 2. Reload the Quadlet Configuration

After adding or modifying Quadlet files, reload the user systemd manager:

    systemctl --user daemon-reload

Verify that the services were discovered:

    systemctl --user list-unit-files | grep semantic

Expected:

    semantic-benchmark-network.service
    semantic-benchmark-service.service
    semantic-benchmark-ui.service

## 3. Start the API

Start the network:

    systemctl --user start semantic-benchmark-network.service

Start the API:

    systemctl --user start semantic-benchmark-service.service

Check the API service:

    systemctl --user status semantic-benchmark-service.service

Test the API health endpoint:

    curl http://127.0.0.1:9050/api/health

Expected:

    {"status":"ok"}

## 4. Start the UI

Start the UI:

    systemctl --user start semantic-benchmark-ui.service

Check the UI service:

    systemctl --user status semantic-benchmark-ui.service

Verify the containers:

    podman ps

Expected port mappings:

    127.0.0.1:9050 -> 9000    API
    127.0.0.1:9060 -> 80      UI

The API listens on port 9000 inside the container.

The UI listens on port 80 inside the container.

The UI communicates with the API through the Podman network using:

    service:9000

## 5. Access the UI Through SSH Port Forwarding

The UI is bound to 127.0.0.1:9060 on the server, so it is not directly exposed to the network.

From your local machine, open a terminal and run:

    ssh -L 9060:127.0.0.1:9060 <your-user>@nfldarustools.rus.uni-stuttgart.de

Replace `<your-user>` with your normal SSH username.

Keep the SSH session open.

Then open the dashboard in your local browser:

    http://localhost:9060

### Background SSH Tunnel

Alternatively, create the tunnel without opening a remote shell:

    ssh -N -L 9060:127.0.0.1:9060 <your-user>@nfldarustools.rus.uni-stuttgart.de

Keep this terminal running while using the dashboard.

### Port Forwarding Architecture

    Local machine
        │
        │ localhost:9060
        ▼
    SSH tunnel
        │
        │ server 127.0.0.1:9060
        ▼
    UI container
        │
        │ service:9000
        ▼
    API container

## 6. Stop the Services

Stop the UI:

    systemctl --user stop semantic-benchmark-ui.service

Stop the API:

    systemctl --user stop semantic-benchmark-service.service

Stop the network:

    systemctl --user stop semantic-benchmark-network.service

## 7. Restart After Configuration Changes

After modifying the Quadlet files:

    systemctl --user daemon-reload

Restart the API:

    systemctl --user restart semantic-benchmark-service.service

Restart the UI:

    systemctl --user restart semantic-benchmark-ui.service

Or restart both:

    systemctl --user daemon-reload
    systemctl --user restart semantic-benchmark-service.service
    systemctl --user restart semantic-benchmark-ui.service

## 8. View Logs

API logs:

    journalctl --user -u semantic-benchmark-service.service -f

UI logs:

    journalctl --user -u semantic-benchmark-ui.service -f

Check service status:

    systemctl --user status semantic-benchmark-service.service
    systemctl --user status semantic-benchmark-ui.service

## 9. Check Running Containers

List containers:

    podman ps

A more readable format:

    podman ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

## 10. Check the API Manually

Test the API through the host port:

    curl http://127.0.0.1:9050/api/health

Test the API directly inside the container:

    podman exec service python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:9000/api/health').read().decode())"

Both should return:

    {"status":"ok"}

## 11. Port Overview

| Component | Container Port | Host Port | Binding |
|-----------|----------------|-----------|---------|
| API       | 9000           | 9050      | 127.0.0.1 |
| UI        | 80             | 9060      | 127.0.0.1 |

### Internal Communication

    UI container → service:9000 → API container

### External Access

    Browser
       │
       │ localhost:9060
       ▼
    SSH tunnel
       │
       ▼
    Server 127.0.0.1:9060
       │
       ▼
    UI container :80
       │
       ▼
    API container :9000

Because both host ports are bound to 127.0.0.1, no public firewall port is required for accessing the dashboard through SSH.
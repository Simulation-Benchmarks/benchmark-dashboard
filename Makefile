.PHONY: dev

PYTHON ?= .venv/bin/python
BOOTSTRAP_PYTHON ?= python3

.DEFAULT_GOAL := dev

ifeq ($(PYTHON),.venv/bin/python)
dev: .venv/bin/python
endif

.venv/bin/python:
	$(BOOTSTRAP_PYTHON) -m venv .venv
	.venv/bin/python -m pip install -r requirements.txt

dev:
	@test -x ui/node_modules/.bin/vite || npm --prefix ui ci --include=dev
	@$(PYTHON) -m uvicorn app.main:app --reload & \
	service_pid=$$!; \
	trap 'kill $$service_pid 2>/dev/null || true' EXIT INT TERM; \
	npm --prefix ui start

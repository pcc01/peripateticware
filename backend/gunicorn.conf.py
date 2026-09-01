# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Gunicorn hooks for prometheus_client's multiprocess mode.

Why this exists: docker-compose.prod.yml runs gunicorn with 4 worker
processes, each an independent Python process with its own memory — a plain
prometheus_client Counter (e.g. core/encryption.py's decrypt-fallback metric)
would silently only reflect whichever one worker happened to handle a given
request, undercounting by up to 4x and resetting to zero on every worker
respawn. prometheus_client's documented fix is PROMETHEUS_MULTIPROC_DIR: each
worker writes its own metric file into that shared directory, and the
/metrics endpoint (main.py) aggregates all of them via
multiprocess.MultiProcessCollector — but only if two things also happen,
both handled here:
  1. on_starting: the directory must be empty when the FIRST worker starts,
     or a stale file left over from a crashed/killed previous run (which
     never got a graceful child_exit) double-counts alongside the new one.
  2. child_exit: when a worker exits, its file must be explicitly finalised
     into an "archived" per-PID file — otherwise a since-exited worker's
     last-known counts are simply dropped from the aggregate instead of
     being preserved.

Loaded automatically because docker-compose.prod.yml's gunicorn command
passes `-c gunicorn.conf.py` (this file, found via gunicorn's CWD = /app).
Has no effect unless PROMETHEUS_MULTIPROC_DIR is actually set in the
environment (also set in docker-compose.prod.yml) — safe to load in any
other environment (dev's plain `uvicorn --reload`, single process, doesn't
even invoke gunicorn) where it's simply never imported.
"""

import os
import shutil


def on_starting(server):
    mp_dir = os.environ.get("PROMETHEUS_MULTIPROC_DIR")
    if mp_dir:
        shutil.rmtree(mp_dir, ignore_errors=True)
        os.makedirs(mp_dir, exist_ok=True)


def child_exit(server, worker):
    mp_dir = os.environ.get("PROMETHEUS_MULTIPROC_DIR")
    if mp_dir:
        from prometheus_client import multiprocess
        multiprocess.mark_process_dead(worker.pid)

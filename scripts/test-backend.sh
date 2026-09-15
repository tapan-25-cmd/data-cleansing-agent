#!/bin/sh
set -eu
cd "$(dirname "$0")/../backend"

# The local pyenv Python links a broken macOS readline extension. Shadowing it keeps
# pytest's optional capture workaround from loading that extension; containers and CI
# may run `python -m pytest` directly.
PYTHONPATH="tests/test_bootstrap:." PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 ../.venv/bin/python -m pytest -p pytest_asyncio.plugin tests "$@"

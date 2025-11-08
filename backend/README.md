# Addris Backend

FastAPI backend that powers the Addris address extraction and routing system. The API ingests delivery images, performs OCR and address parsing, validates them through geocoding, then computes optimized delivery routes.

## Requirements

- Python 3.10+ (managed via [`uv`](https://docs.astral.sh/uv/))
- Tesseract OCR engine installed on the host (macOS: `brew install tesseract`)
- Libpostal native library (macOS: `brew install libpostal`)
- Optional: `libomp` (`brew install libomp`) for OpenCV performance

## Quick start

```bash
# inside backend/
CFLAGS="-I/opt/homebrew/include" LDFLAGS="-L/opt/homebrew/lib" \
uv sync
uv run uvicorn app.main:app --reload
```

> Note: on macOS with Homebrew, the `CFLAGS`/`LDFLAGS` exports ensure the `postal` Python bindings
> can find the native libpostal headers and libraries.

The first run will download Python if you do not already have a compatible interpreter and will install all Python dependencies declared in `pyproject.toml`.

## Environment variables

Create a `.env` file (see `.env.example`) to configure services.

| Variable                       | Description                                                               |
| ------------------------------ | ------------------------------------------------------------------------- |
| `ADDRIS_STORAGE_ROOT`          | Directory where uploaded images and intermediate artifacts will be stored |
| `ADDRIS_GEOCODER_BASE_URL`     | Override for geocoding endpoint (defaults to public Nominatim)            |
| `ADDRIS_GEOCODER_EMAIL`        | Contact email required by public Nominatim                                |
| `ADDRIS_ROUTE_SERVICE_URL`     | Base URL for matrix/route service (default OpenRouteService)              |
| `ADDRIS_ROUTE_SERVICE_API_KEY` | API key when using OpenRouteService                                       |

## Project layout

```
backend/
  app/
    api/           # FastAPI routers
    core/          # Configuration, logging, utilities
    ocr/           # Image preprocessing and OCR helpers
    parsing/       # Address parsing and validation utilities
    routing/       # Route optimization services
    schemas/       # Pydantic models
    services/      # Orchestration and background jobs
  tests/
```

`uv sync` will also install optional developer tools like `pytest` and `ruff` when run with `--extra dev`.

## Testing

```bash
uv sync --extra dev  # first time only
uv run pytest
```

The suite exercises the address parser, routing optimizer, repository persistence, and a stubbed end-to-end job workflow.

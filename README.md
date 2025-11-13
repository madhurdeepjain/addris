## Addris

Addris is an end-to-end address intelligence platform. Couriers capture delivery documents with the mobile app, the FastAPI backend runs OCR and address parsing, validates locations via geocoding, and returns an optimized multi-stop route that can be launched in navigation apps.

---

### Highlights

- FastAPI backend with async OCR, parsing, geocoding, and routing pipeline
- Expo (React Native) client for image capture, job status, and navigation handoff
- Confidence scoring that blends OCR certainty with geocoder feedback
- Works with Google Maps for distance matrices and reverse geocoding, falls back to local heuristics when offline
- Single Docker-free local stack; all services run on your machine

---

### System Architecture

1. **Capture**: The mobile client lets a driver snap or import delivery images and POSTs them to `POST /v1/addresses/extract`.
2. **Extraction Pipeline** (backend):
   - OCR (EasyOCR by default, optional Tesseract) produces text snippets with confidence scores.
   - Libpostal-based parsing normalizes textual addresses; a validation step filters low-quality parses.
   - Geocoding resolves structured addresses to lat/lon, returning a message and resolved label when available.
   - The pipeline combines OCR and geocoder confidence into final candidates and logs telemetry for observability.
3. **Routing**: The mobile client (or other callers) submits the confirmed stops to `POST /v1/routes/`. The backend fetches a distance matrix (Google Routes preferred, Haversine fallback) and solves a single-vehicle TSP with OR-Tools, returning ordered legs and ETA/distance metrics.
4. **Navigation**: The mobile client can open the optimized route in Google Maps; telemetry is available via `/docs` (OpenAPI) or the structured logs.

---

### Repository Layout

```
backend/    # FastAPI service, OCR/parsing/routing logic, tests
mobile/     # Expo React Native app for capturers/drivers
OVERVIEW.md # Project pitch and goals
README.md   # You are here
```

Inside `backend/app/`:

```
api/        # REST routers, versioned under /v1
core/       # Settings, logging
ocr/        # OCR integration and preprocessing
parsing/    # Address parsing and validation helpers
routing/    # Route optimization with OR-Tools
schemas/    # Pydantic response/request models
services/   # Orchestration (storage, geocoding, distance)
```

---

### Prerequisites

| Component | Requirement                                      | Notes                                                      |
| --------- | ------------------------------------------------ | ---------------------------------------------------------- |
| Backend   | Python 3.10+, [`uv`](https://docs.astral.sh/uv/) | `uv` bootstraps Python and installs dependencies           |
|           | Libpostal native library                         | macOS: `brew install libpostal`                            |
|           | Optional: Tesseract OCR                          | macOS: `brew install tesseract`                            |
|           | Optional: libomp for OpenCV                      | macOS: `brew install libomp`                               |
| Mobile    | Node.js 18+, npm 9+                              | Use nvm                                                    |
|           | Expo CLI (optional)                              | `npm install -g expo`                                      |
| Shared    | Google Maps API key (optional)                   | Enables geocoding, traffic-aware routing and toll metadata |

---

### Backend: Run Locally

```bash
# from repo root
cd backend

# 1) Install dependencies (uv pulls Python if missing)
CFLAGS="-I/opt/homebrew/include" LDFLAGS="-L/opt/homebrew/lib" \
	uv sync

# 2) Copy env template and edit values
cp .env.example .env  # update paths, API keys, provider choices

# 3) Launch FastAPI with auto-reload
uv run uvicorn app.main:app --reload
```

Default service URL: `http://127.0.0.1:8000` with docs at `/docs`.

#### Useful Environment Variables (`.env`)

| Variable                           | Purpose                             | Default           |
| ---------------------------------- | ----------------------------------- | ----------------- |
| `ADDRIS_DEBUG`                     | Toggle verbose logging              | `false`           |
| `ADDRIS_STORAGE_ROOT`              | Directory for uploads and artifacts | `./data`          |
| `ADDRIS_GEOCODER_PROVIDER`         | `google` or `nominatim`             | `nominatim`       |
| `ADDRIS_GEOCODER_USER_AGENT`       | Required by Nominatim               | `addris-geocoder` |
| `ADDRIS_GOOGLE_MAPS_API_KEY`       | Enables Google geocoding/distance   | `None`            |
| `ADDRIS_ROUTING_DISTANCE_PROVIDER` | `google` or `haversine` fallback    | `google`          |
| `ADDRIS_ROUTING_USE_TRAFFIC`       | Include live traffic delays         | `true`            |
| `ADDRIS_OCR_BACKEND`               | `easyocr` or `tesseract`            | `easyocr`         |

Logs stream structured payloads; set `ADDRIS_DEBUG=true` for request traces.

#### Run Tests

```bash
uv sync --extra dev  # once
uv run pytest
```

---

### Mobile App: Run Locally

```bash
# from repo root
cd mobile

# 1) Install JS deps
npm install

# 2) Point Expo to backend (adjust host/port to match uvicorn)
export EXPO_PUBLIC_API_URL="http://127.0.0.1:8000"

# 3) Start Expo dev server
npx expo start
```

Launch in Expo Go, iOS Simulator, or Android Emulator. The app requests camera, media, and location permissions. Use **Upload image** to trigger the backend pipeline, **Pull to refresh** for status, and **Open in Maps** to hand off navigation.

For persistent config, add `EXPO_PUBLIC_API_URL` to `.env` or `app.config.js` per the [Expo environment docs](https://docs.expo.dev/guides/environment-variables/).

---

### API Surface

| Method | Path                    | Description                                                                                                |
| ------ | ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| `POST` | `/v1/addresses/extract` | Accepts a JPEG/PNG upload, returns OCR candidates with confidence, geocode metadata, and validation status |
| `POST` | `/v1/routes/`           | Accepts origin + stops, returns ordered route legs, ETAs, toll flags, and provider metadata                |
| `GET`  | `/health`               | Heartbeat for probes                                                                                       |

Swagger UI and ReDoc are available at `/docs` and `/redoc` respectively once the server runs.

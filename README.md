# Employee monitoring with AI

Bachelor thesis project: a multi-tenant web app that watches IP cameras (RTSP), recognizes
employees by face, detects personal protective equipment (PPE) with a custom YOLO model and raises
alerts from user-defined rules.

The version presented at the thesis defense is tagged `thesis-v1`. The original notes and to-do list are in
[docs/thesis-notes.md](docs/thesis-notes.md).

## Features

- **Organizations (multi-tenant)**: each organization gets its own PostgreSQL database; users,
  roles and permissions live in a shared database. Admins invite security guards by link.
- **Live cameras**: RTSP cameras are read with OpenCV and streamed to the browser.
- **Face recognition**: employees are registered with a photo; faces in the stream are matched
  with `face_recognition` (dlib).
- **PPE detection**: YOLOv8 model trained on a construction-site dataset (hard hats, vests, masks,
  vehicles, ...), tracked with ByteTrack.
- **Zones**: polygons drawn on top of a camera.
- **Alert rules**: conditions such as "object detected", "PPE missing", "unauthorized person" or
  "face recognized", combined with AND/OR, with priority and cooldown. Alerts are stored with
  a screenshot.
- **Dashboard**: alert statistics and an optional LLM summary of alerts (local Ollama).

## Architecture

```
 Browser (React + Vite + Tailwind)
    │  REST + MJPEG (/api/...)
    ▼
 nginx ──► Flask API (gunicorn) ──► PostgreSQL
                │                     ├─ emonitoring_users   (users, tenants, roles)
                │                     └─ <tenant uuid> ...    (one DB per organization)
                ▼
     camera worker threads: OpenCV ► face_recognition / YOLO ► rule engine ► alerts
                ▲
          RTSP cameras
```

| Folder | Content |
|---|---|
| `EmployeeMonitoringBE/flaskr` | Flask app: `routes/` (HTTP API), `entities/` (SQLAlchemy models), `services/` (auth, rules, alerts, storage), `migrations/` (Alembic), `ML/` (YOLO weights, face encoding) |
| `EmployeeMonitoringBE/tests` | pytest suite (SQLite, ML libraries stubbed) |
| `EmployeeMonitoringBE/train` | YOLO training results (metrics and plots) |
| `EmployeeMonitoringFE/src` | React app: `pages/`, `components/`, `services/MainService.jsx` (API client) |

## Running with Docker (recommended)

```bash
docker compose up --build
# open http://localhost:8080 and log in as admin@example.com / admin12345
```

The first build compiles dlib, so it takes several minutes. Configuration:

- Secrets: `EmployeeMonitoringBE/flaskr/.env` is loaded if it exists (see
  `EmployeeMonitoringBE/.env.example`). Set at least `JWT_SECRET`, plus `SENDER_EMAIL` and
  `SENDER_PASSWORD` (a Gmail app password) so self-registration can send verification codes.
- The first admin comes from `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` and `SEED_ORGANIZATION`.

**No camera at hand?** Start a simulated one:

```bash
docker compose --profile camera-sim up --build
```

Then add a camera in the UI with IP `mediamtx`, port `8554` and any username/password. To stream
your own footage, put it at `docker/videos/sample.mp4`; otherwise a test pattern is used.

## Running locally (development)

Backend (Python 3.11+, PostgreSQL running locally):

```bash
cd EmployeeMonitoringBE
python -m venv .venv && .venv/Scripts/activate     # Windows; use .venv/bin/activate on Linux/macOS
pip install -r requirements.txt                     # needs CMake + a C++ compiler for dlib
cp .env.example flaskr/.env                         # then edit it
flask --app flaskr seed --admin-email you@example.com --admin-password "a-good-password"
flask --app flaskr run --debug
```

Frontend:

```bash
cd EmployeeMonitoringFE
npm ci
npm run dev            # http://localhost:5173, API at VITE_API_URL (default http://127.0.0.1:5000)
```

## Database migrations

Schema changes are Alembic migrations, in two trees: `migrations/users` (central DB) and
`migrations/tenant` (applied to every organization's DB).

```bash
flask --app flaskr make-migration tenant -m "add something"   # then edit the generated file
flask --app flaskr migrate                                     # upgrade every tenant database
```

The users DB is upgraded on startup, and a tenant DB is upgraded the first time it is used.
Databases created before migrations existed (`thesis-v1`) are detected and upgraded automatically.

## Tests and linting

```bash
cd EmployeeMonitoringBE && pip install -r requirements-dev.txt && python -m pytest && ruff check flaskr tests
cd EmployeeMonitoringFE && npm run lint && npm run build
```

GitHub Actions runs both on every push and pull request.

## Main API endpoints

| Area | Endpoints |
|---|---|
| Auth | `POST /users/login`, `POST /users/register`, `POST /users/verify-email`, `POST /users/refresh` |
| Guards | `GET/DELETE /users/security[/<id>]`, `POST /users/security/invitation`, `POST /users/security/register` |
| Cameras | `GET/POST /video-cameras/`, `GET/DELETE /video-cameras/<id>`, `GET /video-cameras/<name>/stream?token=...` |
| Employees | `GET/POST /employees/`, `GET/PUT/DELETE /employees/<id>`, `GET /employees/<id>/profile-picture` |
| Zones | `GET /zone/?camera_id=`, `POST /zone/`, `DELETE /zone/` |
| Rules | `GET/POST /alert-rules/`, `PUT/DELETE /alert-rules/<id>`, `GET /alert-rules/camera/<id>` |
| Alerts | `GET /alerts/?status=&level=&limit=&offset=`, `GET/PUT /alerts/<id>`, `GET /alerts/screenshot/<id>` |

Every endpoint except login/registration needs `Authorization: Bearer <token>`.

from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from threading import Lock
from typing import Generator, Iterable
from uuid import UUID

from app.schemas.jobs import AddressCandidate, RouteLeg
from app.services.models import JobRecord


class JobRepository:
    """Simple SQLite-backed persistence layer for job records."""

    def __init__(self, db_path: Path) -> None:
        self._db_path = db_path
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = Lock()
        self._ensure_schema()

    @contextmanager
    def _connect(self) -> Generator[sqlite3.Connection, None, None]:
        conn = sqlite3.connect(self._db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()

    def _ensure_schema(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS jobs (
                    job_id TEXT PRIMARY KEY,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    image_path TEXT NOT NULL,
                    origin_lat REAL,
                    origin_lon REAL,
                    addresses_json TEXT NOT NULL,
                    route_json TEXT NOT NULL,
                    errors_json TEXT NOT NULL
                )
                """
            )
            conn.commit()

    def upsert(self, record: JobRecord) -> None:
        payload = (
            str(record.job_id),
            record.status,
            record.created_at.isoformat(),
            record.updated_at.isoformat(),
            str(record.image_path),
            record.origin[0] if record.origin else None,
            record.origin[1] if record.origin else None,
            json.dumps(
                [candidate.model_dump() for candidate in record.addresses],
                ensure_ascii=False,
            ),
            json.dumps([leg.model_dump() for leg in record.route], ensure_ascii=False),
            json.dumps(record.errors, ensure_ascii=False),
        )

        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO jobs (
                    job_id, status, created_at, updated_at, image_path,
                    origin_lat, origin_lon, addresses_json, route_json, errors_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(job_id) DO UPDATE SET
                    status=excluded.status,
                    created_at=excluded.created_at,
                    updated_at=excluded.updated_at,
                    image_path=excluded.image_path,
                    origin_lat=excluded.origin_lat,
                    origin_lon=excluded.origin_lon,
                    addresses_json=excluded.addresses_json,
                    route_json=excluded.route_json,
                    errors_json=excluded.errors_json
                """,
                payload,
            )
            conn.commit()

    def get(self, job_id: UUID) -> JobRecord | None:
        with self._lock, self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM jobs WHERE job_id = ?", (str(job_id),)
            ).fetchone()
        if row is None:
            return None
        return self._row_to_record(row)

    def list(self) -> Iterable[JobRecord]:
        with self._lock, self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM jobs ORDER BY created_at DESC"
            ).fetchall()
        return [self._row_to_record(row) for row in rows]

    @staticmethod
    def _row_to_record(row: sqlite3.Row) -> JobRecord:
        addresses_payload = (
            json.loads(row["addresses_json"]) if row["addresses_json"] else []
        )
        route_payload = json.loads(row["route_json"]) if row["route_json"] else []

        addresses = [AddressCandidate(**item) for item in addresses_payload]
        route = [RouteLeg(**item) for item in route_payload]

        origin = None
        if row["origin_lat"] is not None and row["origin_lon"] is not None:
            origin = (row["origin_lat"], row["origin_lon"])

        return JobRecord(
            job_id=UUID(row["job_id"]),
            status=row["status"],
            created_at=datetime.fromisoformat(row["created_at"]),
            updated_at=datetime.fromisoformat(row["updated_at"]),
            image_path=Path(row["image_path"]),
            origin=origin,
            addresses=addresses,
            route=route,
            errors=json.loads(row["errors_json"]) if row["errors_json"] else [],
        )

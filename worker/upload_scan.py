"""Upload a Comment Lens manifest and NDJSON artifact."""
from __future__ import annotations
import argparse
import hashlib
import hmac
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

MAX_CHUNK_BYTES = 512 * 1024

def required_env(name: str) -> str:
    value = os.environ.get(name, "")
    if not value:
        raise ValueError(f"Missing required environment variable: {name}")
    return value

def validate_identifier(value: str, name: str) -> str:
    if not value or len(value) > 256 or any(char not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-" for char in value):
        raise ValueError(f"Invalid {name}")
    return value

def validate_repository(value: str) -> str:
    owner, separator, name = value.partition("/")
    if not separator or not owner or not name or any(char not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.-" for char in owner + name):
        raise ValueError("Invalid REPOSITORY_ID")
    return value

def validate_url(value: str) -> str:
    if not value.startswith("https://") or value.endswith("/"):
        raise ValueError("UPLOAD_BASE_URL must be an https URL without a trailing slash")
    return value

def request_json(url: str, body: bytes, secret: bytes, request_id: str, repository_id: str) -> None:
    timestamp = str(int(time.time()))
    digest = hmac.new(secret, f"{timestamp}.".encode() + body, hashlib.sha256).hexdigest()
    request = urllib.request.Request(url, data=body, method="POST", headers={
        "Content-Type": "application/json", "User-Agent": "comment-lens-worker/1",
        "X-Comment-Lens-Signature": f"sha256={digest}", "X-Comment-Lens-Timestamp": timestamp,
        "X-Comment-Lens-Chunk-Id": request_id, "Idempotency-Key": request_id,
        "X-Comment-Lens-Repository-Id": repository_id,
    })
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                if response.status < 200 or response.status >= 300:
                    raise RuntimeError(f"Upload returned HTTP {response.status}")
            return
        except urllib.error.HTTPError as error:
            if error.code < 500 and error.code != 429:
                raise RuntimeError(f"Upload rejected with HTTP {error.code}") from error
            if attempt == 3:
                raise RuntimeError(f"Upload failed with HTTP {error.code}") from error
        except (urllib.error.URLError, TimeoutError) as error:
            if attempt == 3:
                raise RuntimeError("Upload failed after retries") from error
        time.sleep(2**attempt)

def read_records(path: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    with path.open("rb") as stream:
        for line_number, line in enumerate(stream, 1):
            if not line.strip():
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(f"Invalid NDJSON at line {line_number}") from error
            if not isinstance(record, dict):
                raise ValueError(f"NDJSON line {line_number} is not an object")
            records.append(record)
    return records

def build_chunks(records: list[dict[str, Any]], manifest: dict[str, Any], scan_id: str, repository_id: str) -> list[bytes]:
    groups: list[list[dict[str, Any]]] = [[]]
    for record in records:
        candidate = groups[-1] + [record]
        probe = json.dumps({"comments": candidate}, separators=(",", ":")).encode()
        if len(probe) > MAX_CHUNK_BYTES and groups[-1]:
            groups.append([record])
        elif len(probe) > MAX_CHUNK_BYTES:
            raise ValueError("A scan comment exceeds the maximum chunk size")
        else:
            groups[-1] = candidate
    total = len(groups)
    payloads: list[bytes] = []
    for sequence, comments in enumerate(groups):
        payload = {"schemaVersion": 1, "scanId": scan_id, "chunkId": f"{scan_id}:{sequence}",
                   "sequence": sequence, "totalChunks": total, "comments": comments,
                   "files": manifest["files"] if sequence == 0 else [],
                   "diagnostics": manifest["diagnostics"] if sequence == 0 else []}
        if manifest.get("repoId") != repository_id:
            raise ValueError("Manifest repository does not match upload identity")
        payloads.append(json.dumps(payload, separators=(",", ":")).encode())
    return payloads

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifact", type=Path, required=True, help="Directory containing manifest.json and comments.ndjson")
    args = parser.parse_args()
    if not args.artifact.is_dir():
        raise ValueError("Scan artifact directory does not exist")
    base_url = validate_url(required_env("UPLOAD_BASE_URL"))
    scan_id = validate_identifier(required_env("SCAN_ID"), "SCAN_ID")
    repository_id = validate_repository(required_env("REPOSITORY_ID"))
    secret = required_env("INGESTION_SIGNING_SECRET").encode()
    manifest_path = args.artifact / "manifest.json"
    if not manifest_path.is_file():
        manifest_path = args.artifact / "scan.json"
    ndjson_path = args.artifact / "comments.ndjson"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("scanId") != scan_id or manifest.get("repoId") != repository_id:
        raise ValueError("Manifest identity does not match upload identity")
    records = read_records(ndjson_path)
    chunks = build_chunks(records, manifest, scan_id, repository_id)
    for sequence, body in enumerate(chunks):
        request_json(f"{base_url}/api/worker/scans/{scan_id}/chunks", body, secret, f"{scan_id}:{sequence}", repository_id)
    content_sha256 = hashlib.sha256("".join(hashlib.sha256(chunk).hexdigest() for chunk in chunks).encode()).hexdigest()
    completion = {"schemaVersion": 1, "scanId": scan_id, "manifest": manifest,
                  "commentCount": len(records), "fileCount": len(manifest["files"]),
                  "chunkCount": len(chunks), "contentSha256": content_sha256}
    request_json(f"{base_url}/api/worker/scans/{scan_id}/complete", json.dumps(completion, separators=(",", ":")).encode(), secret, f"{scan_id}:complete", repository_id)
    print(f"Uploaded {len(records)} comments in {len(chunks)} chunks")
    return 0

if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, RuntimeError, json.JSONDecodeError) as error:
        print(f"comment-lens upload failed: {error}", file=sys.stderr)
        raise SystemExit(1) from error

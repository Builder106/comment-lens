"""Mark a Comment Lens scan failed after a worker job failure."""
from __future__ import annotations

import json
import os
import sys

from upload_scan import request_json, required_env, validate_identifier, validate_repository, validate_url


def main() -> int:
    base_url = validate_url(required_env("UPLOAD_BASE_URL"))
    scan_id = validate_identifier(required_env("SCAN_ID"), "SCAN_ID")
    repository_id = validate_repository(required_env("REPOSITORY_ID"))
    secret = required_env("INGESTION_SIGNING_SECRET").encode()
    body = json.dumps({
        "schemaVersion": 1,
        "scanId": scan_id,
        "reason": "Comment Lens worker did not produce a complete scan artifact.",
    }, separators=(",", ":")).encode()
    request_json(
        f"{base_url}/api/worker/scans/{scan_id}/failure",
        body,
        secret,
        f"{scan_id}:failure",
        repository_id,
    )
    print(f"Marked scan {scan_id} failed")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, RuntimeError, json.JSONDecodeError) as error:
        print(f"comment-lens failure notification failed: {error}", file=sys.stderr)
        raise SystemExit(1) from error

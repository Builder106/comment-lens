import hashlib
import hmac
import json
import unittest
from unittest.mock import patch

from upload_scan import build_chunks, request_json


class UploadScanTests(unittest.TestCase):
    def setUp(self) -> None:
        self.manifest = {"repoId": "owner/repo", "files": [], "diagnostics": []}

    def test_chunks_have_contract_identity_and_contiguous_sequences(self) -> None:
        chunks = build_chunks([{"commentId": "one"}, {"commentId": "two"}], self.manifest, "scan-1", "owner/repo")
        payloads = [json.loads(chunk) for chunk in chunks]
        self.assertEqual([payload["sequence"] for payload in payloads], [0])
        self.assertEqual(payloads[0]["totalChunks"], 1)
        self.assertEqual(payloads[0]["scanId"], "scan-1")

    def test_manifest_repository_mismatch_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            build_chunks([], self.manifest, "scan-1", "other/repo")

    def test_signature_uses_timestamp_and_raw_body(self) -> None:
        captured = {}

        class Response:
            status = 200

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

        def opener(request, timeout):
            captured.update(request.headers)
            captured["body"] = request.data
            return Response()

        body = b'{"schemaVersion":1}'
        with patch("upload_scan.urllib.request.urlopen", opener), patch("upload_scan.time.time", return_value=1700000000):
            request_json("https://example.test/api", body, b"secret", "scan-1:0", "owner/repo")
        expected = hmac.new(b"secret", b"1700000000." + body, hashlib.sha256).hexdigest()
        self.assertEqual(captured["X-comment-lens-signature"], f"sha256={expected}")
        self.assertEqual(captured["X-comment-lens-timestamp"], "1700000000")
        self.assertEqual(captured["X-comment-lens-repository-id"], "owner/repo")


if __name__ == "__main__":
    unittest.main()

"""Require an accepted notarization of the unchanged plugin ZIP before upload."""
import argparse
import hashlib
import json
from pathlib import Path


def verify(archive, result, expected_sha256):
    if result.get('status') != 'Accepted' or not result.get('id'):
        raise ValueError(f'Notarization not accepted: {result.get("status", "missing status")}')
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    if digest != expected_sha256:
        raise ValueError('Plugin ZIP changed during notarization')
    return {'archive': archive.name, 'sha256': digest,
            'submission_id': result['id'], 'status': result['status']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('--result', type=Path, required=True)
    parser.add_argument('--sha256', required=True)
    parser.add_argument('--receipt', type=Path, required=True)
    args = parser.parse_args()
    receipt = verify(args.archive, json.loads(args.result.read_text(encoding='utf-8')), args.sha256)
    args.receipt.write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')

"""Fast delivery for public artwork shipped with a release.

Serve the optimized release copy directly. Signed Stratus redirects add a
network round trip and their no-store response prevents browser reuse.
User media retains its separate authenticated Stratus storage path.
"""
import json
from functools import lru_cache
from pathlib import Path
from flask import send_from_directory


@lru_cache(maxsize=4)
def manifest(root):
    path = Path(root) / 'catalog' / 'manifest.json'
    return json.loads(path.read_text()) if path.exists() else {}


def response_for(app, filename):
    item = manifest(app.root_path).get(filename)
    if not item: return None
    response = send_from_directory(Path(app.root_path) / 'catalog', item['file'],
                                   mimetype=item['mime'], etag=item['digest'],
                                   conditional=True, max_age=3600)
    response.headers['X-Media-Source'] = 'release-catalog'
    return response

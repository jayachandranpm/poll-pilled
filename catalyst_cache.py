"""Best-effort cache for immutable payloads, never the current balance/auth state."""
import json
import hashlib
import os
import time
from collections import OrderedDict
from threading import RLock

_entries = OrderedDict()
_lock = RLock()
_bytes = 0
MAX_BYTES = 16 * 1024 * 1024
MAX_ITEM = 1024 * 1024


def cache_key(key):
    # Catalyst rejects long names, including otherwise valid asset digests.
    # A fixed 43-character, namespaced hash fits its key limit.
    return 'pp:' + hashlib.sha256(key.encode()).hexdigest()[:40]


def _remember(key, record):
    global _bytes
    size = len(record['value'].encode())
    if size > MAX_ITEM: return
    with _lock:
        old = _entries.pop(key, None)
        if old: _bytes -= old[1]
        _entries[key] = (record, size)
        _bytes += size
        while _bytes > MAX_BYTES or len(_entries) > 128:
            _, (_, removed) = _entries.popitem(last=False)
            _bytes -= removed


def get(sdk, key):
    global _bytes
    key = cache_key(key)
    with _lock:
        item = _entries.get(key)
        if item and item[0]['expires'] > time.time():
            _entries.move_to_end(key)
            return item[0]['value']
        if item:
            _bytes -= _entries.pop(key)[1]
    segment = os.getenv('PP_CATALYST_CACHE_SEGMENT')
    if not segment: return None
    try:
        raw = sdk.cache().segment(segment).get_value(key)
        record = json.loads(raw) if raw else None
        if isinstance(record, dict) and record.get('expires', 0) > time.time() and isinstance(record.get('value'), str):
            _remember(key, record)
            return record['value']
    except Exception:
        pass  # Cache outages must not affect the durable source of truth.
    return None


def put(sdk, key, value, seconds=3600):
    key = cache_key(key)
    if len(value.encode()) > MAX_ITEM: return
    record = dict(value=value, expires=time.time() + seconds)
    _remember(key, record)
    segment = os.getenv('PP_CATALYST_CACHE_SEGMENT')
    if segment:
        try:
            sdk.cache().segment(segment).put(key, json.dumps(record), 1)
        except Exception:
            pass

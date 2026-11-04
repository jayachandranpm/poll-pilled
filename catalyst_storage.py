"""Catalyst-only transactional snapshot storage for the first deployment.

SQLite executes each transaction privately in memory. An encrypted immutable
snapshot is uploaded to Stratus, then a unique next revision is inserted in
Data Store. The unique constraint is the commit point: a stale writer cannot
overwrite a newer transaction. A failed/ambiguous commit is never acknowledged
unless its exact object and digest are found in the revision table.

This deliberately serializes writes across the MVP. It is bounded to 32 MiB;
do not present it as a high-throughput database. Old revisions are backups,
and must not be deleted while they are needed for recovery/audit.
"""
import hashlib
import os
import re
import sqlite3
import uuid
import zlib
import mimetypes
from pathlib import Path
from flask import g, has_request_context, request
from ai_runtime import vault_cipher
import catalyst_cache

TABLE = 'PollStateRevisions'
MAX_BYTES = 32 * 1024 * 1024


class StorageConflict(Exception):
    pass


class StorageUnavailable(Exception):
    pass


class CatalystStore:
    def __init__(self, app):
        import zcatalyst_sdk
        self.sdk = zcatalyst_sdk.initialize(req=request, scope='admin')
        self.table = self.sdk.datastore().table(TABLE)
        self.bucket = self.sdk.stratus().bucket(app.config['CATALYST_BUCKET'])
        self.cipher = vault_cipher(app)

    def latest(self):
        try:
            rows = self.sdk.zcql().execute_query(f'SELECT Revision,ObjectKey,Digest FROM {TABLE} ORDER BY Revision DESC LIMIT 1')
            return rows[0][TABLE] if rows else None
        except Exception:
            raise StorageUnavailable('Catalyst storage is temporarily unavailable. Please try again.') from None

    def load(self, template):
        head = self.latest()
        if not head:
            return 0, template
        # Always read the latest durable revision first. Only its immutable,
        # encrypted object is cached, so auth revocation and credits stay fresh.
        cache_key = 'pp:snapshot:' + head['Digest']
        cached = catalyst_cache.get(self.sdk, cache_key)
        raw = cached.encode() if cached else None
        if raw is None or hashlib.sha256(raw).hexdigest() != head['Digest']:
            raw = self.bucket.get_object(head['ObjectKey'])
        if hashlib.sha256(raw).hexdigest() != head['Digest']:
            raise StorageUnavailable('The stored revision could not be verified.')
        if not cached or cached.encode() != raw:
            catalyst_cache.put(self.sdk, cache_key, raw.decode())
        decoder = zlib.decompressobj()
        data = decoder.decompress(self.cipher.decrypt(raw), MAX_BYTES + 1)
        if len(data) > MAX_BYTES or not decoder.eof:
            raise StorageUnavailable('The stored revision exceeds the supported size.')
        return int(head['Revision']), data

    def commit(self, revision, data):
        if len(data) > MAX_BYTES:
            raise StorageUnavailable('Storage capacity requires an administrator review.')
        raw = self.cipher.encrypt(zlib.compress(data, 6))
        key = f'state/{uuid.uuid4().hex}.bin'
        digest = hashlib.sha256(raw).hexdigest()
        try:
            uploaded = self.bucket.put_object(key, raw, {'content_type': 'application/octet-stream'})
            if uploaded is not True:
                raise StorageUnavailable('Upload was not acknowledged.')
        except Exception:
            raise StorageUnavailable('Your changes could not be stored. Please retry the same action.') from None
        row = dict(Revision=revision + 1, ObjectKey=key, Digest=digest)
        try:
            result = self.table.insert_row(row)
            if str(result.get('Revision')) != str(revision + 1) or result.get('Digest') != digest:
                raise StorageUnavailable('The storage receipt could not be verified.')
        except Exception:
            # Reconcile a lost HTTP acknowledgement without repeating the write.
            try:
                rows = self.sdk.zcql().execute_query(f'SELECT Revision,ObjectKey,Digest FROM {TABLE} WHERE Revision={revision+1}')
                committed = rows[0][TABLE] if rows else None
            except Exception:
                raise StorageUnavailable('The save could not be confirmed. Retry the same action.') from None
            if not committed:
                raise StorageUnavailable('The save could not be confirmed. Retry the same action.') from None
            if committed['ObjectKey'] != key or committed['Digest'] != digest:
                raise StorageConflict('Another request finished first. Please try your action again.') from None
        return revision + 1


class SnapshotConnection:
    def __init__(self, store, template, identity_secret=None):
        self.store = store
        self.template = template
        self.revision, data = store.load(template)
        self.conn = sqlite3.connect(':memory:')
        self.conn.deserialize(data)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute('PRAGMA foreign_keys=ON')
        self.changed = self.conn.total_changes
        self.failed = False
        self.migrate_features(identity_secret)

    def migrate_features(self, identity_secret=None):
        # Additive, versioned rollout: never rebuild the live snapshot from seed data.
        if not self.conn.execute("SELECT 1 FROM sqlite_master WHERE name='pp_accounts'").fetchone(): return
        from community_features import FEATURE_SCHEMA
        from community_following import FOLLOW_SCHEMA, backfill_identities
        missing_features=not self.conn.execute("SELECT 1 FROM sqlite_master WHERE name='pp_takedowns'").fetchone()
        missing_following=not self.conn.execute("SELECT 1 FROM sqlite_master WHERE name='pp_people'").fetchone()
        if not missing_features and not missing_following: return
        self.conn.execute('BEGIN IMMEDIATE')
        try:
            for statement in ((FEATURE_SCHEMA if missing_features else '')+(FOLLOW_SCHEMA if missing_following else '')).split(';'):
                if statement.strip(): self.conn.execute(statement)
            if 'audio_origin' not in {r[1] for r in self.conn.execute('PRAGMA table_info(pp_invites)')}:
                self.conn.execute("ALTER TABLE pp_invites ADD COLUMN audio_origin TEXT NOT NULL DEFAULT 'human'")
            if missing_following and identity_secret is not None: backfill_identities(self.conn,identity_secret)
            self.conn.commit()
            self.revision=self.store.commit(self.revision,self.conn.serialize())
            self.changed=self.conn.total_changes
        except Exception:
            self.failed=True
            raise

    def execute(self, *args, **kwargs):
        if self.failed:
            raise StorageUnavailable('Restart this action with the latest saved data.')
        return self.conn.execute(*args, **kwargs)

    def executemany(self, *args, **kwargs):
        # Rate limiting and other batched writes must use the same transaction
        # and failed-save guard as individual statements. Do not commit here.
        if self.failed:
            raise StorageUnavailable('Restart this action with the latest saved data.')
        return self.conn.executemany(*args, **kwargs)

    def refresh(self):
        """Reload only at an explicit, replay-safe transaction boundary."""
        if self.conn.in_transaction or (not self.failed and self.conn.total_changes != self.changed):
            raise StorageUnavailable('Finish the current transaction before refreshing.')
        revision, data = self.store.load(self.template)
        self.conn.deserialize(data)
        self.conn.execute('PRAGMA foreign_keys=ON')
        self.revision = revision
        self.changed = self.conn.total_changes
        self.failed = False

    def executescript(self, *args, **kwargs):
        raise StorageUnavailable('Schema changes require an explicit storage migration.')

    def commit(self):
        if self.failed:
            raise StorageUnavailable('The earlier save could not be confirmed.')
        dirty = self.conn.total_changes != self.changed
        self.conn.commit()
        if dirty:
            try:
                self.revision = self.store.commit(self.revision, self.conn.serialize())
            except Exception:
                self.failed = True
                raise
            self.changed = self.conn.total_changes

    def rollback(self):
        self.conn.rollback()
        self.changed = self.conn.total_changes

    def close(self):
        self.conn.close()

    def __enter__(self):
        return self

    def __exit__(self, kind, value, traceback):
        if kind is None:
            self.commit()
        else:
            self.rollback()


def replayable_write(conn, write, attempts=3):
    """Retry only explicitly idempotent local writes, never a provider operation.

    Callers must address their own unique operation IDs and must not calculate
    wallet debits or other dependent state outside the transaction.
    """
    for attempt in range(attempts):
        if isinstance(conn, SnapshotConnection): conn.refresh()
        try:
            with conn:
                conn.execute('BEGIN IMMEDIATE')
                result = write()
            return result
        except StorageConflict:
            if attempt == attempts - 1: raise


def store_for(app):
    if not app.config.get('CATALYST_STORAGE') or not has_request_context():
        return None
    if 'catalyst_store' not in g:
        g.catalyst_store = CatalystStore(app)
    return g.catalyst_store


def persist_media(app, filename):
    store = store_for(app)
    if store:
        raw = Path(app.config['UPLOAD_FOLDER'], filename).read_bytes()
        try:
            result = store.bucket.put_object('media/' + filename, raw, {'content_type':mimetypes.guess_type(filename)[0] or 'application/octet-stream'})
            if result is not True: raise StorageUnavailable('Media upload was not acknowledged.')
        except Exception:
            raise StorageUnavailable('Your file could not be stored. Please try uploading again.') from None


def fetch_media(app, filename):
    if not re.fullmatch(r'[a-f0-9]{32}\.(webp|webm|ogg|wav|m4a|mp3|mp4)', filename):
        return
    path = Path(app.config['UPLOAD_FOLDER'], filename)
    store = store_for(app)
    if store and not path.exists():
        raw = store.bucket.get_object('media/' + filename)
        temp = path.with_suffix(path.suffix + '.' + uuid.uuid4().hex + '.tmp')
        temp.write_bytes(raw)
        os.replace(temp, path)

"""Run HTTP workflows through the deployed snapshot adapter, not plain SQLite.

Only the remote object/revision service is replaced; routing, authentication,
CSRF, rate limits, transactions, credits and serialization are real app code.
"""
import sqlite3
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

from app import create_app
from catalyst_storage import SnapshotConnection, StorageConflict, StorageUnavailable
import test_community as community_tests
import test_feature_completion as feature_tests
import test_following as following_tests
import test_routine_security as security_tests


class SnapshotService:
    def __init__(self, data):
        self.data, self.revision = data, 0
        self.lock = threading.Lock()
        self.bucket = self
        self.objects = {}

    def load(self, template):
        with self.lock: return self.revision, self.data

    def commit(self, revision, data):
        with self.lock:
            if revision != self.revision: raise StorageConflict('Concurrent save')
            self.data = data
            self.revision += 1
            return self.revision

    def put_object(self, key, data, options=None):
        self.objects[key] = data
        return True

    def get_object(self, key): return self.objects[key]


class CloudFixture:
    def attach_cloud(self):
        # Snapshot the prepared fixture once. Every subsequent HTTP request
        # creates a fresh SnapshotConnection, just as each cloud worker does.
        db = sqlite3.connect(self.app.config['DATABASE'])
        try: self.store = SnapshotService(db.serialize())
        finally: db.close()
        self.app.config['CATALYST_STORAGE'] = True
        for target in ['app.store_for', 'catalyst_storage.store_for']:
            p = patch(target, return_value=self.store)
            p.start(); self.addCleanup(p.stop)

    def sql(self, query, args=()):
        connection = SnapshotConnection(self.store, self.app.extensions['database_template'])
        try:
            with connection: result = connection.execute(query, args).fetchall()
            return result
        finally: connection.close()


class CloudCommunityTests(CloudFixture, unittest.TestCase):
    client = community_tests.CommunityTests.client
    post = community_tests.CommunityTests.post
    state = community_tests.CommunityTests.state
    create = community_tests.CommunityTests.create
    answer = community_tests.CommunityTests.answer
    accept = community_tests.CommunityTests.accept
    topup = community_tests.CommunityTests.topup
    tearDown = community_tests.CommunityTests.tearDown

    def setUp(self):
        community_tests.CommunityTests.setUp(self)
        self.attach_cloud()

    # Reuse the same behavioral contract across the local and deployed stores.
    test_preferences_and_drafts = community_tests.CommunityTests.test_persistence_and_public_identity
    test_rewards_and_duplicate_answer = community_tests.CommunityTests.test_rewards_pending_accepted_and_no_self_vote
    test_ranking = community_tests.CommunityTests.test_full_ranking_and_invalid_answers
    test_credit_reserve_and_refund = community_tests.CommunityTests.test_credits_publish_retry_and_unused_refund
    test_publish_idempotency = community_tests.CommunityTests.test_publish_idempotency_and_claim_restore
    test_invalid_publish_rollback = community_tests.CommunityTests.test_invalid_publish_rolls_back_pool
    test_audio_upload_and_privacy = community_tests.CommunityTests.test_audio_ownership_and_private_response
    test_video_and_audio_publishing = community_tests.CommunityTests.test_video_validation_ownership_and_public_question_audio
    test_results_and_reactions = community_tests.CommunityTests.test_poll_results_are_locked_until_answer_and_reactions_require_participation
    test_allocation_and_reports = community_tests.CommunityTests.test_allocation_requires_100_points_and_reports_are_private_idempotent
    test_appeals = community_tests.CommunityTests.test_access_control_and_review_appeals
    test_paid_followups = community_tests.CommunityTests.test_followups_consent_payment_idempotence_refund
    test_generated_voice_labels = community_tests.CommunityTests.test_known_generated_answer_audio_cannot_remove_ai_label
    test_pairwise = feature_tests.FeatureCompletionTests.test_pairwise_round_validation_and_locked_results
    test_regions = feature_tests.FeatureCompletionTests.test_region_validation_and_answer
    test_ab = feature_tests.FeatureCompletionTests.test_ab_assignment_statistics_and_exposure_privacy
    test_draft_after_publication = feature_tests.FeatureCompletionTests.test_publishing_removes_only_its_own_draft
    test_targeting = feature_tests.FeatureCompletionTests.test_targeting_enforced_before_claim_and_forecast
    test_export = feature_tests.FeatureCompletionTests.test_archive_contains_only_requester_records
    test_concurrent_reservations = community_tests.CommunityTests.test_claim_capacity_concurrent_and_expiration

    def test_publish_replays_known_conflict_without_duplicate_poll_or_charge(self):
        before=self.state(self.owner)['pool']
        original=self.store.commit
        calls=[]
        def collide(revision,data):
            calls.append(revision)
            if len(calls)==2:
                peer=SnapshotConnection(self.store,self.app.extensions['database_template'])
                try:
                    with peer: peer.execute("INSERT INTO security_limits VALUES ('other-user', 123)")
                finally: peer.close()
            return original(revision,data)
        with patch.object(self.store,'commit',side_effect=collide):
            pid=self.create(responses=2)
        self.assertEqual(self.state(self.owner)['pool'],before-400)
        self.assertEqual(self.sql('SELECT COUNT(*) FROM pp_polls WHERE id=?',(pid,))[0][0],1)
        self.assertEqual(self.sql("SELECT COUNT(*) FROM security_limits WHERE subject='other-user'")[0][0],1)

    def test_receipt_unlocks_results_and_updates_wallet_without_another_request(self):
        self.post(self.person, '/polls/home/claim')
        first = self.post(self.person, '/polls/home/answer', {'answer': 1})
        self.assertEqual(first.status_code, 200, first.json)
        self.assertTrue(first.json['poll']['results_unlocked'])
        self.assertEqual(first.json['poll']['my_response'], first.json['response'])
        self.assertEqual(first.json['wallet']['points'], first.json['poll']['reward'])
        duplicate = self.post(self.person, '/polls/home/answer', {'answer': 1})
        self.assertEqual(duplicate.json, first.json)
        reacted = self.post(self.person, '/polls/home/react', {'reaction': 'helpful'})
        self.assertEqual(reacted.json['poll']['my_reaction'], 'helpful')
        self.assertEqual(reacted.json['poll']['reactions'], {'helpful': 1})

    def test_bulk_write_is_atomic_and_failed_snapshot_rejects_further_writes(self):
        conn = SnapshotConnection(self.store, self.app.extensions['database_template'])
        before = self.store.revision
        try:
            with self.assertRaises(RuntimeError):
                with conn:
                    conn.executemany('INSERT INTO security_limits VALUES (?, ?)', [('rollback', 1), ('rollback', 2)])
                    raise RuntimeError('rollback')
            self.assertEqual(self.store.revision, before)
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM security_limits WHERE subject='rollback'").fetchone()[0], 0)
            conn.failed = True
            with self.assertRaises(StorageUnavailable):
                conn.executemany('INSERT INTO security_limits VALUES (?, ?)', [('blocked', 3)])
        finally: conn.close()

    def test_unexpected_api_failure_is_json_and_preserves_private_exception_details(self):
        self.app.config['PROPAGATE_EXCEPTIONS'] = False
        with patch('app.SnapshotConnection', side_effect=RuntimeError('private provider detail')):
            with self.assertLogs(self.app.logger, 'ERROR'):
                result = self.person.post('/api/community/preferences', json={'theme':'dark'}, headers={'X-CSRF-Token':self.person.token})
        self.assertEqual(result.status_code, 500)
        self.assertEqual(len(result.json['reference']), 12)
        self.assertNotIn('private provider detail', result.text)
        self.assertIn('kept', result.json['error'])


class CloudSecurityTests(CloudFixture, unittest.TestCase):
    def setUp(self):
        security_tests.RoutineSecurityTests.setUp(self)
        self.attach_cloud()
    tearDown = security_tests.RoutineSecurityTests.tearDown
    post = security_tests.RoutineSecurityTests.post
    def request(self, email='person@example.com'):
        result = self.post('register', {'email':email, 'password':'correct horse violet balcony'})
        self.assertEqual(result.status_code, 200, result.json)
        return result.json['challenge_id'], self.sent[-1][1]
    login = security_tests.RoutineSecurityTests.login
    save = security_tests.RoutineSecurityTests.save
    test_authenticated_routine_workflow = security_tests.RoutineSecurityTests.test_routine_workflow_never_calls_provider_and_policy_matches_real_routes
    test_captcha_free_answer_and_reaction = security_tests.RoutineSecurityTests.test_answers_need_no_captcha_and_reactions_stay_locked_until_answering
    test_ai_tools_without_repeated_captcha = security_tests.RoutineSecurityTests.test_every_ai_tool_uses_session_protection_without_calling_turnstile
    test_ai_creation_and_cache = security_tests.RoutineSecurityTests.test_image_studio_rewrite_transcription_and_voice_work_without_another_captcha
    test_ai_limits = security_tests.RoutineSecurityTests.test_ai_budget_and_feature_limits_still_stop_provider_calls


    def test_ai_reservation_and_cache_conflicts_rebase_without_repeating_provider(self):
        self.login()
        with self.app.test_request_context('/api/admin/settings'):
            self.app.extensions['platform_write']('meta_key','test-meta-only')
        original=self.store.commit
        collided=set()
        def collide(revision,data):
            probe=sqlite3.connect(':memory:')
            try:
                probe.deserialize(data)
                state='cache' if probe.execute("SELECT COUNT(*) FROM ai_calls WHERE state='cache'").fetchone()[0] else 'pending' if probe.execute("SELECT COUNT(*) FROM ai_calls WHERE state='pending'").fetchone()[0] else ''
            finally:probe.close()
            if state and state not in collided:
                collided.add(state)
                peer=SnapshotConnection(self.store,self.app.extensions['database_template'])
                try:
                    with peer:peer.execute('INSERT INTO security_limits VALUES (?,?)',('peer-'+state,123))
                finally:peer.close()
            return original(revision,data)
        with patch.object(self.store,'commit',side_effect=collide), patch('cloudflare_integration.check_token',side_effect=AssertionError('AI CAPTCHA')), patch('meta_ai.provider_request',return_value={'choices':[{'message':{'content':'Which design would you choose?'}}]}) as provider:
            data={'task':'rephrase','prompt':'Which design do you like the most?'}
            first=self.save('/api/ai',data)
            self.assertEqual(first.status_code,200,first.json)
            cached=self.save('/api/ai',data)
            self.assertEqual(cached.status_code,200,cached.json)
            self.assertTrue(cached.json['ai_usage']['cached'])
            self.assertEqual(provider.call_count,1)
        self.assertEqual(collided,{'pending','cache'})
        self.assertEqual(self.sql("SELECT COUNT(*) FROM ai_calls WHERE state='complete'")[0][0],1)
        self.assertEqual(self.sql("SELECT COUNT(*) FROM ai_calls WHERE state='pending'")[0][0],0)


class CloudFollowingTests(CloudFixture, unittest.TestCase):
    def setUp(self):
        following_tests.FollowingTests.setUp(self)
        self.attach_cloud()
    tearDown = following_tests.FollowingTests.tearDown
    client = following_tests.FollowingTests.client
    state = following_tests.FollowingTests.state
    post = following_tests.FollowingTests.post
    follow = following_tests.FollowingTests.follow
    publish = following_tests.FollowingTests.publish
    notices = following_tests.FollowingTests.notices
    test_follow_publish_answer_review_reward_react = following_tests.FollowingTests.test_follow_publish_answer_review_reward_and_react_as_one_workflow
    test_notification_preferences = following_tests.FollowingTests.test_notice_preferences_language_formats_ai_and_audience_are_enforced


class CloudStartupTests(unittest.TestCase):
    def test_cloud_template_does_not_open_or_modify_a_shared_local_database(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'must-not-open.sqlite'
            path.write_bytes(b'not a database')
            config = dict(TESTING=True, CATALYST_STORAGE=True, SECRET_KEY='template-test', DATABASE=str(path), UPLOAD_FOLDER=str(Path(directory)/'uploads'))
            one, two = create_app(config), create_app(config)
            self.assertEqual(path.read_bytes(), b'not a database')
            for app in [one, two]:
                conn = sqlite3.connect(':memory:')
                conn.deserialize(app.extensions['database_template'])
                self.assertIn('audio_origin', {r[1] for r in conn.execute('PRAGMA table_info(pp_responses)')})
                conn.close()

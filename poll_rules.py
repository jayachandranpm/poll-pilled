"""Public identity, creation provenance, and versioned effort estimates."""
import hashlib
import hmac
import math

ORIGINS = {'human', 'rephrased', 'generated'}
MODES = {'text', 'voice', 'image', 'interactive'}
POLICY_VERSION = '2026-10-29'


def public_identity(secret, viewer, tagline=''):
    digest = hmac.new(str(secret).encode(), viewer.encode(), hashlib.sha256).hexdigest()
    adjectives = ['Curious', 'Thoughtful', 'Bright', 'Gentle', 'Bold', 'Quiet', 'Kind', 'Wondering']
    nouns = ['Otter', 'Finch', 'Panda', 'Fox', 'Orca', 'Owl', 'Koala', 'Robin']
    name = f'{adjectives[int(digest[:2],16)%8]} {nouns[int(digest[2:4],16)%8]} {digest[4:10].upper()}'
    return dict(author=name, initials=''.join(x[0] for x in name.split()[:2]), tagline=tagline)


def quote(data):
    mode = data.get('mode', 'text')
    if mode not in MODES:
        raise ValueError('Choose a supported poll format.')
    options = data.get('options', [])
    if not isinstance(options, list) or len(options) > 4 or any(not isinstance(x,str) for x in options):
        raise ValueError('Choose up to four answers.')
    words = len((' '.join(str(data.get(k,'')) for k in ('title','description'))+' '+' '.join(options)).split())
    base = {'text':10, 'voice':45, 'image':25, 'interactive':20}[mode]
    seconds = min(180, max(20, math.ceil((base+words/3+max(0,len(options)-2)*3)/5)*5))
    complexity = int(mode != 'text')
    reward_credits = 2 + complexity + max(0, math.ceil((seconds-30)/30))
    return dict(estimated_seconds=seconds, vote_points=reward_credits*100,
                voice_points=100, platform_credits=2, response_credits=reward_credits+3,
                complexity='Standard' if mode=='text' else {'voice':'Audio','image':'Visual comparison','interactive':'Interactive'}[mode],
                pricing_version=POLICY_VERSION)


def origins(data):
    result = {key: data.get(key, 'human') for key in ('text_origin','audio_origin','image_origin')}
    if any(not isinstance(value,str) or value not in ORIGINS for value in result.values()):
        raise ValueError('Choose how the question and media were created.')
    return result

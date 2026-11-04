"""Deterministic poll rules shared by validation, results and quality review."""
import math
import re
from itertools import combinations

AVATARS = ('otter', 'orbit', 'river', 'willow')
LANGUAGES = ('English', 'Hindi', 'Tamil', 'Spanish')
COUNTRIES = ('India', 'United States', 'United Kingdom', 'Canada', 'Australia', 'Singapore', 'Other')
AGE_BANDS = ('18–24', '25–34', '35–44', '45–54', '55+')

def pairwise_result(answer, count):
    if not isinstance(answer, dict) or not isinstance(answer.get('rounds'), list):
        raise ValueError('Complete every head-to-head round.')
    expected = set(combinations(range(count), 2)); seen = set(); wins = [0] * count
    for r in answer['rounds']:
        if not isinstance(r, dict) or any(type(r.get(k)) is not int for k in ('a', 'b', 'winner')):
            raise ValueError('Each round needs two choices and one winner.')
        pair = tuple(sorted((r['a'], r['b'])))
        if pair not in expected or pair in seen or r['winner'] not in pair:
            raise ValueError('Each pair must be compared exactly once.')
        seen.add(pair); wins[r['winner']] += 1
    if seen != expected: raise ValueError('Complete every head-to-head round.')
    winner = max(range(count), key=lambda i: (wins[i], -i))
    return dict(winner=winner, rounds=answer['rounds'], wins=wins)

def winning_choice(answer):
    if isinstance(answer, dict): return answer['winner']
    return answer[0] if isinstance(answer, list) else answer

def validate_regions(regions, count):
    if not isinstance(regions, list) or len(regions) != count:
        raise ValueError('Add one image region for each choice.')
    result = []
    for r in regions:
        if not isinstance(r, dict): raise ValueError('Choose valid image regions.')
        values = [r.get(k) for k in ('x', 'y', 'width', 'height')]
        if any(type(v) not in (int, float) or not math.isfinite(v) for v in values):
            raise ValueError('Region coordinates must be finite numbers.')
        x, y, w, h = values
        if not (0 <= x < 1 and 0 <= y < 1 and .01 <= w <= 1 and .01 <= h <= 1 and x+w <= 1.00001 and y+h <= 1.00001):
            raise ValueError('Keep every region within the image.')
        result.append(dict(zip(('x', 'y', 'width', 'height'), values)))
    return result

def preference_statistics(totals):
    n = sum(totals)
    if len(totals) != 2 or not n: return None
    k = totals[0]; p = k/n; z = 1.96
    center = (p+z*z/(2*n))/(1+z*z/n)
    radius = z*math.sqrt(p*(1-p)/n+z*z/(4*n*n))/(1+z*z/n)
    # Exact two-sided binomial test against equal preference. Counts are capped at 500.
    pvalue = min(1., 2*sum(math.comb(n, i) for i in range(min(k, n-k)+1))/2**n)
    return dict(n=n, a_interval=[round(100*(center-radius),1),round(100*(center+radius),1)],
                p_value=round(pvalue,4), clear_preference=n>=30 and pvalue<.05,
                method='Randomized presentation order; Wilson 95% interval; exact binomial test')

def quality_signals(note, elapsed, estimate, duplicate=False):
    flags=[]
    if elapsed < max(2, estimate*.12): flags.append('Completed unusually quickly')
    if note and len(re.sub(r'\W', '', note)) < 5: flags.append('Very little explanatory content')
    if re.search(r'(.)\1{7,}', note): flags.append('Repeated characters')
    if duplicate: flags.append('Explanation repeats an earlier response')
    return dict(score=max(0,100-25*len(flags)),flags=flags,
                automatic_rejection=False, label='Review signals, not a judgment about the participant')

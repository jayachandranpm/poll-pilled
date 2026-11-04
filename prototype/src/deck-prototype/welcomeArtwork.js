// Original Poll Pilled illustrations. Decorative: the adjacent headings carry
// the meaning, so screen readers can go straight to the form.
const scenes = new Set(['signin', 'interests', 'formats', 'identity']);

export function welcomeArtwork(scene = 'signin', className = '', priority = false) {
  const key = scenes.has(scene) ? scene : 'signin';
  return `<img class="welcome-artwork ${className}" src="/assets/welcome/poll-pilled-${key}.png" alt="" aria-hidden="true" width="1254" height="1254" decoding="async"${priority ? ' fetchpriority="high"' : ''}>`;
}

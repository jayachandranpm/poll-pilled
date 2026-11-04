import markUrl from './brand/poll-pilled-spark-mark.png?inline';
import './brand.css';

// One generated brand asset, recolored through its alpha for both app themes.
// The surrounding link owns the accessible name; this mark is decorative.
export const logo = () => `<span class="brand-mark" aria-hidden="true" style="--brand-symbol:url('${markUrl}')"></span>`;

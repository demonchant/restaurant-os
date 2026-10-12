import Link from 'next/link';
export default function FoundationPage() {
  return <main><section aria-labelledby="foundation-title"><p className="eyebrow">Pinchichi Restaurant OS</p><h1 id="foundation-title">Identity gateway</h1><p>Secure identity and restaurant organization management are active. Ordering remains deferred to its designated phase.</p><nav aria-label="Application choices"><Link className="button-link" href="/auth/customer">Customer phone sign-in</Link><Link className="button-link secondary-link" href="/auth/staff">Staff sign-in</Link><Link className="button-link secondary-link" href="/staff">Staff administration</Link><Link className="button-link secondary-link" href="/organization">Restaurant organization</Link></nav></section></main>;
}

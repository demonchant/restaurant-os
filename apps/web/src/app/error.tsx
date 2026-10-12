'use client';
export default function ErrorBoundary({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <main><section><h1>Something went wrong</h1><p>The request could not be completed safely.</p><button type="button" onClick={reset}>Try again</button></section></main>; }

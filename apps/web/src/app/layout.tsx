import type { Metadata } from 'next';
import './styles.css';
export const metadata: Metadata = { title: 'Restaurant OS', description: 'Restaurant OS platform' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }

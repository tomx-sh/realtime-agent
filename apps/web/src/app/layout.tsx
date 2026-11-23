import type { Metadata } from 'next';
import './style.css';
export const metadata: Metadata = { title: 'Resonance · Voice studio', description: 'Local French speech workspace' };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}


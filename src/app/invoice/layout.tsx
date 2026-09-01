import type { Metadata } from 'next';

// Invoices contain personal and contract data — never index them.
export const metadata: Metadata = {
  title: 'Invoice',
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function InvoiceLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

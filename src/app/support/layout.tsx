import type { Metadata } from 'next';

export const metadata:Metadata = {
  title:'Public Support | FleetFlow',
  description:'Guest FAQs and direct contact with FleetFlow platform management for general inquiries, suggestions, privacy, legal, access, and platform issues.',
};

export default function SupportLayout({ children }:{ children:React.ReactNode }) { return children; }

'use client';

import dynamic from 'next/dynamic';

const CampusApp = dynamic(() => import('./campus-app'), { ssr: false });

export default function ClientShell() {
  return <CampusApp />;
}

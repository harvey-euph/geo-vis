"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

const GeoVisApp = dynamic(() => import("@/components/GeoVisApp"), {
  ssr: false,
  loading: () => <div className="h-screen w-screen bg-[#050914]" />,
});

export default function HomePage() {
  return (
    <Suspense fallback={<div className="h-screen w-screen bg-[#050914]" />}>
      <GeoVisApp />
    </Suspense>
  );
}

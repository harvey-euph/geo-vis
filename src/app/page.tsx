import { Suspense } from "react";
import GeoVisApp from "@/components/GeoVisApp";

export default function HomePage() {
  return (
    <Suspense fallback={<div className="h-screen w-screen bg-[#050914]" />}>
      <GeoVisApp />
    </Suspense>
  );
}

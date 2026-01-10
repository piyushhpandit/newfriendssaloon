import { Suspense } from "react";
import { WaitlistClient } from "./WaitlistClient";

export default function WaitlistPage({
  searchParams,
}: {
  searchParams: { waitlist?: string; token?: string };
}) {
  return (
    <Suspense>
      <WaitlistClient waitlistId={searchParams.waitlist ?? null} token={searchParams.token ?? null} />
    </Suspense>
  );
}



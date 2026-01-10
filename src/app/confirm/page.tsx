import { Suspense } from "react";
import { ConfirmClient } from "./ConfirmClient";

export default function ConfirmPage({
  searchParams,
}: {
  searchParams: { booking?: string; token?: string };
}) {
  return (
    <Suspense>
      <ConfirmClient bookingId={searchParams.booking ?? null} token={searchParams.token ?? null} />
    </Suspense>
  );
}



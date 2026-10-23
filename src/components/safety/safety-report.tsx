"use client";

import { useState } from "react";
import { ReportFlow } from "@/components/report/report-flow";
import { EmergencyPanel } from "./emergency-panel";

/** Safety & Security report: the shared report flow plus an emergency panel that turns red on danger. */
export function SafetyReport({ userId, buildings }: { userId: string; buildings: readonly string[] }) {
  const [emergency, setEmergency] = useState(false);

  return (
    <div className="space-y-5">
      <EmergencyPanel emergency={emergency} />
      <ReportFlow
        module="security"
        userId={userId}
        buildings={buildings}
        onEmergencyChange={setEmergency}
        textPlaceholder="Tell us what happened, in your own words — English or Hindi. You don't have to name anyone. E.g. “Seniors made us stand in the corridor at night and shouted at us” or “मेरा फ़ोन कॉमन रूम से चोरी हो गया”"
      />
    </div>
  );
}

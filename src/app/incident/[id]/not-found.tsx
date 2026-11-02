import { Gone } from "@/components/pages/gone";

export default function IncidentNotFound() {
  return (
    <Gone title="This incident is no longer on the map">
      <p>Incidents stay on Global Hack Map for 30 days after they are first reported, then they age out. This one has gone, or the link is mistyped.</p>
      <p>The live map has everything reported in the last month, each with its sources.</p>
    </Gone>
  );
}

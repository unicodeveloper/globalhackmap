import { Gone } from "@/components/pages/gone";

export default function CveNotFound() {
  return (
    <Gone title="We could not find that vulnerability">
      <p>
        Global Hack Map looks up every CVE in CISA&apos;s exploited list and the National Vulnerability Database. This ID is not in either, or it is not a valid
        CVE ID (they look like CVE-2024-3400).
      </p>
      <p>Newly reserved CVEs can take a few days to be published.</p>
    </Gone>
  );
}

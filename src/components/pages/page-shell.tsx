import { SiteBar } from "@/components/hud/latest-cves";
import { PageFrame } from "@/components/pages/page-frame";

/** Every indexable page, with the new-CVE banner in the site bar. */
export function PageShell({ children }: { children: React.ReactNode }) {
  return <PageFrame bar={<SiteBar />}>{children}</PageFrame>;
}

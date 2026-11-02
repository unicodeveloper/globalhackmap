/** Vendor domains for logos. Only well-known vendors; anything else gets a monogram. */
const VENDOR_DOMAINS: Record<string, string> = {
  php: "php.net",
  "php group": "php.net",
  microsoft: "microsoft.com",
  apple: "apple.com",
  google: "google.com",
  cisco: "cisco.com",
  fortinet: "fortinet.com",
  ivanti: "ivanti.com",
  citrix: "citrix.com",
  "palo alto networks": "paloaltonetworks.com",
  beyondtrust: "beyondtrust.com",
  gitlab: "gitlab.com",
  atlassian: "atlassian.com",
  vmware: "vmware.com",
  broadcom: "broadcom.com",
  oracle: "oracle.com",
  sap: "sap.com",
  adobe: "adobe.com",
  mozilla: "mozilla.org",
  linux: "kernel.org",
  apache: "apache.org",
  "check point": "checkpoint.com",
  f5: "f5.com",
  zyxel: "zyxel.com",
  arista: "arista.com",
  dell: "dell.com",
  siemens: "siemens.com",
  wordpress: "wordpress.org",
  plex: "plex.tv",
  sonicwall: "sonicwall.com",
  juniper: "juniper.net",
  progress: "progress.com",
  samsung: "samsung.com",
  android: "android.com",
  "d-link": "dlink.com",
  "tp-link": "tp-link.com",
  mikrotik: "mikrotik.com",
  veeam: "veeam.com",
  "trend micro": "trendmicro.com",
  sophos: "sophos.com",
  zimbra: "zimbra.com",
  jenkins: "jenkins.io",
  github: "github.com",
  openssl: "openssl.org",
  nginx: "nginx.org",
  "hewlett packard enterprise (hpe)": "hpe.com",
  hpe: "hpe.com",
  ibm: "ibm.com",
  isc: "isc.org",
  proftpd: "proftpd.org",
  wso2: "wso2.com",
  onlyoffice: "onlyoffice.com",
  strapi: "strapi.io",
  litellm: "litellm.ai",
  ahsay: "ahsay.com",
};

/** NVD-derived names arrive as "Php" or "Gitlab": restore the usual casing. */
const VENDOR_NAMES: Record<string, string> = { php: "PHP", "php group": "PHP", gitlab: "GitLab" };

export function vendorDomain(vendor: string): string | undefined {
  return VENDOR_DOMAINS[vendor.trim().toLowerCase()];
}

export function tidyVendor(value: string): string {
  const name = value.trim();
  return VENDOR_NAMES[name.toLowerCase()] ?? name;
}

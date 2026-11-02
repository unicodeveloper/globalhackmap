import { Gone } from "@/components/pages/gone";

export default function CountryNotFound() {
  return (
    <Gone title="We do not know that country code">
      <p>Country pages use two-letter ISO codes, like /country/GB for the United Kingdom or /country/JP for Japan.</p>
    </Gone>
  );
}

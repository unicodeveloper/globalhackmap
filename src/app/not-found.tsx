import { Gone } from "@/components/pages/gone";

export default function NotFound() {
  return (
    <Gone title="Nothing lives at this address">
      <p>The link is mistyped, or the page has moved.</p>
    </Gone>
  );
}

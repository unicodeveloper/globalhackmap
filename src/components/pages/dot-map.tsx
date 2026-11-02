import { type MapView, type Marker, dotMapSvg } from "@/lib/og/map";
import { cn } from "@/lib/utils";

/** The OG cards' dot-matrix map, server-rendered as inline SVG. No WebGL, no client JavaScript. */
export function DotMap({
  view,
  markers,
  focus,
  label,
  className,
}: {
  view: MapView;
  markers: Marker[];
  focus?: { x: number; y: number; radius: number };
  label: string;
  className?: string;
}) {
  return (
    <div
      role="img"
      aria-label={label}
      className={cn("[&>svg]:block [&>svg]:size-full", className)}
      dangerouslySetInnerHTML={{ __html: dotMapSvg(view, { markers, focus, responsive: true }) }}
    />
  );
}

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Ruler } from "lucide-react";
import { Suspense, lazy, useMemo } from "react";

import { api } from "../../api/client";
import type { Box, BoxItem, InvoiceLine, Placement } from "../../api/types";
import { Spinner } from "../../components/ui";
import { formatInt } from "../../lib/format";

const Box3DView = lazy(() => import("./Box3DView"));

interface LayoutResult {
  placements: Placement[];
  unplaced: BoxItem[];
  estimated_line_ids: string[];
}

function Loading() {
  return (
    <div className="flex h-[460px] items-center justify-center gap-2 text-sm text-slate-500">
      <Spinner /> Arranging the box in 3D…
    </div>
  );
}

export function Box3DPanel({ box, lines }: { box: Box; lines: InvoiceLine[] }) {
  const boxLines = useMemo(() => {
    const ids = new Set(box.items.map((item) => item.line_id));
    return lines.filter((line) => ids.has(line.id));
  }, [box.items, lines]);
  const hasLayout = box.placements.length > 0;
  const hasSize = Boolean(box.length_cm && box.width_cm && box.height_cm);

  const layout = useQuery({
    queryKey: ["box-layout", box.length_cm, box.width_cm, box.height_cm, box.items, boxLines],
    queryFn: () =>
      api.post<LayoutResult>("/api/packing/layout", {
        length_cm: box.length_cm,
        width_cm: box.width_cm,
        height_cm: box.height_cm,
        items: box.items,
        lines: boxLines,
      }),
    enabled: !hasLayout && hasSize && box.items.length > 0,
    staleTime: Infinity,
  });

  const layoutPlacements = layout.data?.placements;
  const viewBox = useMemo(
    () => (hasLayout ? box : { ...box, placements: layoutPlacements ?? [] }),
    [box, hasLayout, layoutPlacements],
  );

  if (!hasSize) return <p className="py-10 text-center text-sm text-slate-500">Enter the box size (L × W × H) to see it in 3D.</p>;
  if (!box.items.length) return <p className="py-10 text-center text-sm text-slate-500">This box is empty.</p>;
  if (!hasLayout && layout.isLoading) return <Loading />;
  if (!hasLayout && layout.isError) return <p className="py-10 text-center text-sm text-rose-600">{layout.error.message}</p>;

  const unplaced = hasLayout ? [] : (layout.data?.unplaced ?? []);
  const estimated = hasLayout ? 0 : (layout.data?.estimated_line_ids.length ?? 0);
  const names = new Map(lines.map((line) => [line.id, line.name]));

  return (
    <div className="space-y-3">
      {(unplaced.length > 0 || estimated > 0) && (
        <div className="space-y-2">
          {unplaced.length > 0 && (
            <p className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                Does not physically fit in this box:{" "}
                {unplaced.map((u) => `${names.get(u.line_id) ?? u.line_id} (${formatInt(u.qty)} pcs)`).join(", ")}. Use a bigger box or Auto-pack.
              </span>
            </p>
          )}
          {estimated > 0 && (
            <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <Ruler className="mt-0.5 size-4 shrink-0" />
              {estimated} products have no size yet — shown with sizes estimated from their weight.
            </p>
          )}
        </div>
      )}
      <Suspense fallback={<Loading />}>
        <Box3DView box={viewBox} lines={lines} />
      </Suspense>
    </div>
  );
}

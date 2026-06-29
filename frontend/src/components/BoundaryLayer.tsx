import { memo, useEffect, useState } from "react";
import { GeoJSON } from "react-leaflet";
import type { FeatureCollection, MultiPolygon, Polygon as GeoJsonPolygon } from "geojson";
import { loadBoundaryGeoJson } from "../gridCells";

function BoundaryLayer() {
  const [data, setData] = useState<FeatureCollection<
    GeoJsonPolygon | MultiPolygon
  > | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadBoundaryGeoJson()
      .then((geojson) => {
        if (!cancelled) setData(geojson);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) return null;

  return (
    <GeoJSON
      data={data}
      className="maharashtra-boundary"
      pathOptions={{
        color: "#111827",
        fillColor: "transparent",
        fillOpacity: 0,
        opacity: 0.95,
        weight: 2.5,
      }}
    />
  );
}

export default memo(BoundaryLayer);

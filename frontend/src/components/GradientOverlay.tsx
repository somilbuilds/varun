import { memo, useEffect, useRef, useState } from "react";
import { ImageOverlay } from "react-leaflet";
import type { DisplayChannel } from "../types";
import { buildGradientUrlAsync, GRADIENT_BOUNDS } from "../gradientCanvas";

type Props = {
  valueGrid: (number | null)[][] | null;
  displayChannel: DisplayChannel;
  minVal: number;
  maxVal: number;
  frameKey: string;
  visible: boolean;
};

function GradientOverlayInner({
  valueGrid,
  displayChannel,
  minVal,
  maxVal,
  frameKey,
  visible,
}: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (!visible || !valueGrid) {
      setImageUrl(null);
      return;
    }

    const id = ++requestId.current;
    let cancelled = false;

    buildGradientUrlAsync(valueGrid, displayChannel, minVal, maxVal, frameKey)
      .then((url) => {
        if (!cancelled && id === requestId.current) {
          setImageUrl(url);
        }
      })
      .catch(() => {
        if (!cancelled && id === requestId.current) {
          setImageUrl(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [visible, valueGrid, displayChannel, minVal, maxVal, frameKey]);

  if (!visible || !imageUrl) return null;

  return (
    <ImageOverlay
      url={imageUrl}
      bounds={GRADIENT_BOUNDS}
      opacity={0.82}
      zIndex={450}
      className="climate-gradient-overlay"
    />
  );
}

export default memo(GradientOverlayInner);

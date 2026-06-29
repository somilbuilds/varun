export type TimelineFrame = {
  date: string;
  label?: string;
  frameType?: "observed" | "forecast";
};

type FrameListProps = {
  mode: "frames";
  frames: TimelineFrame[];
};

type FrameCountProps = {
  mode: "count";
  frameCount: number;
  resolveFrame: (index: number) => TimelineFrame;
};

type Props = {
  index: number;
  onChange: (index: number) => void;
  isPlaying: boolean;
  onPlayToggle: () => void;
  resolutionLabel?: string;
} & (FrameListProps | FrameCountProps);

function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function TimeSlider(props: Props) {
  const {
    index,
    onChange,
    isPlaying,
    onPlayToggle,
    resolutionLabel = "Daily",
  } = props;

  const frameCount =
    props.mode === "frames" ? props.frames.length : props.frameCount;

  if (frameCount === 0) return null;

  const safeIndex = Math.max(0, Math.min(index, frameCount - 1));
  const current =
    props.mode === "frames"
      ? props.frames[safeIndex]
      : props.resolveFrame(safeIndex);

  const stepBack = () => onChange(Math.max(0, safeIndex - 1));
  const stepForward = () => onChange(Math.min(frameCount - 1, safeIndex + 1));

  return (
    <div className="time-slider" aria-label="Daily timeline">
      <div className="time-slider-top">
        <span className="time-slider-resolution">{resolutionLabel} timeline</span>
        <span className="time-slider-date">
          {formatDate(current.date)}
          {current.frameType === "forecast" && (
            <span className="time-slider-tag time-slider-tag--forecast">AI forecast</span>
          )}
          {current.frameType === "observed" && frameCount <= 2 && (
            <span className="time-slider-tag">Observed</span>
          )}
        </span>
      </div>

      <div className="time-slider-controls">
        <button
          type="button"
          className="time-btn"
          onClick={stepBack}
          disabled={safeIndex <= 0}
          aria-label="Previous day"
        >
          ◀
        </button>

        <button
          type="button"
          className={`time-btn time-btn--play${isPlaying ? " time-btn--playing" : ""}`}
          onClick={onPlayToggle}
          aria-label={isPlaying ? "Pause animation" : "Play animation"}
        >
          {isPlaying ? "❚❚" : "▶"}
        </button>

        <input
          type="range"
          className="time-slider-range"
          min={0}
          max={Math.max(0, frameCount - 1)}
          step={1}
          value={safeIndex}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-valuetext={current.date}
        />

        <button
          type="button"
          className="time-btn"
          onClick={stepForward}
          disabled={safeIndex >= frameCount - 1}
          aria-label="Next day"
        >
          ▶
        </button>

        <span className="time-slider-counter">
          {safeIndex + 1} / {frameCount}
        </span>
      </div>
    </div>
  );
}

/** Map history slider index to ISO date string. */
export function historyDateFromIndex(index: number, start = "2015-01-01"): string {
  const cursor = new Date(`${start}T12:00:00`);
  cursor.setDate(cursor.getDate() + index);
  return cursor.toISOString().slice(0, 10);
}

/** Map ISO date to history slider index. */
export function historyIndexFromDate(date: string, start = "2015-01-01"): number {
  const startMs = new Date(`${start}T12:00:00`).getTime();
  const targetMs = new Date(`${date}T12:00:00`).getTime();
  return Math.round((targetMs - startMs) / 86_400_000);
}

/** Inclusive day count between two ISO dates. */
export function historyDayCount(start: string, end: string): number {
  return historyIndexFromDate(end, start) + 1;
}

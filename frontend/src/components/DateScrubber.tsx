/**
 * Date scrubber for the historical view.
 * Lets the user pick any date in the 2015-2025 dataset.
 */

type Props = {
  value: string;        // ISO date YYYY-MM-DD
  onChange: (date: string) => void;
};

const MIN_DATE = "2015-01-01";
const MAX_DATE = "2025-12-31";

export default function DateScrubber({ value, onChange }: Props) {
  return (
    <div className="date-scrubber">
      <label htmlFor="history-date-input" className="scrubber-label">
        Date
      </label>
      <input
        id="history-date-input"
        type="date"
        min={MIN_DATE}
        max={MAX_DATE}
        value={value}
        onChange={(e) => {
          if (e.target.value) onChange(e.target.value);
        }}
        className="scrubber-input"
      />
      <span className="scrubber-range">2015 – 2025</span>
    </div>
  );
}

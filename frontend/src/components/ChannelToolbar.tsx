import type { DisplayChannel } from "../types";

export type ChannelOption = {
  id: DisplayChannel;
  label: string;
  short: string;
  icon: string;
  hint: string;
};

export const CHANNEL_OPTIONS: ChannelOption[] = [
  { id: "rainfall", label: "Rainfall", short: "Rain", icon: "🌧", hint: "Daily rainfall (mm)" },
  { id: "max_temp", label: "Max Temp", short: "Max", icon: "☀", hint: "Daily maximum temperature" },
  { id: "min_temp", label: "Min Temp", short: "Min", icon: "🌙", hint: "Daily minimum temperature" },
  { id: "mean_temp", label: "Mean Temp", short: "Avg", icon: "μ", hint: "(Max + Min) / 2" },
  { id: "temp_range", label: "Diurnal Range", short: "ΔT", icon: "↕", hint: "Max − Min temperature span" },
];

type Props = {
  value: DisplayChannel;
  onChange: (channel: DisplayChannel) => void;
};

export default function ChannelToolbar({ value, onChange }: Props) {
  return (
    <nav className="channel-toolbar" aria-label="Climate variable toolbar">
      <p className="toolbar-heading">Layers</p>
      {CHANNEL_OPTIONS.map(({ id, label, short, icon, hint }) => (
        <button
          key={id}
          type="button"
          className={`channel-tool${value === id ? " channel-tool--active" : ""}`}
          aria-pressed={value === id}
          title={hint}
          onClick={() => onChange(id)}
        >
          <span className="channel-tool-icon" aria-hidden="true">
            {icon}
          </span>
          <span className="channel-tool-text">
            <span className="channel-tool-label">{label}</span>
            <span className="channel-tool-short">{short}</span>
          </span>
        </button>
      ))}
    </nav>
  );
}

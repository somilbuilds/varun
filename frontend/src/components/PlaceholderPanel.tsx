type PlaceholderPanelProps = {
  title: string;
  codeMarker: string;
};

export default function PlaceholderPanel({ title, codeMarker }: PlaceholderPanelProps) {
  return (
    <section className="placeholder-panel" aria-label={title}>
      <div>
        <p className="eyebrow">Coming next</p>
        <h2>{title}</h2>
      </div>
      <p className="code-marker">{codeMarker}</p>
    </section>
  );
}

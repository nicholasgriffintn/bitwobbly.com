interface CheckboxItem {
  id: string;
  label: string;
  checked: boolean;
}

interface CheckboxListProps {
  items: CheckboxItem[];
  onChange: (id: string, checked: boolean) => void;
  emptyMessage?: string;
  className?: string;
}

export function CheckboxList({
  items,
  onChange,
  emptyMessage = "No items available.",
  className = "",
}: CheckboxListProps) {
  if (items.length === 0) {
    return <div className={`muted ${className}`.trim()}>{emptyMessage}</div>;
  }

  return (
    <div className={`nested-list ${className}`.trim()}>
      {items.map((item) => (
        <label key={item.id} className="checkbox-row">
          <input
            type="checkbox"
            checked={item.checked}
            onChange={(e) => onChange(item.id, e.target.checked)}
          />
          <span>{item.label}</span>
        </label>
      ))}
    </div>
  );
}

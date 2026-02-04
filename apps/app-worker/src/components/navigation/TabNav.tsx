interface Tab {
  id: string;
  label: string;
  count?: number;
}

interface TabNavProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  className?: string;
}

export function TabNav({
  tabs,
  activeTab,
  onTabChange,
  className = "",
}: TabNavProps) {
  return (
    <div className={`mb-4 flex gap-2 ${className}`.trim()}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={activeTab === tab.id ? "" : "outline"}
          onClick={() => onTabChange(tab.id)}
          style={{ fontSize: "0.875rem", padding: "0.5rem 1rem" }}
        >
          {tab.label}
          {tab.count !== undefined && ` (${tab.count})`}
        </button>
      ))}
    </div>
  );
}

interface PlatformSelectProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
}

export function PlatformSelect({ id, value, onChange }: PlatformSelectProps) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select platform...</option>
      <option value="javascript">JavaScript</option>
      <option value="typescript">TypeScript</option>
      <option value="react">React</option>
      <option value="vue">Vue</option>
      <option value="node">Node.js</option>
      <option value="python">Python</option>
      <option value="go">Go</option>
      <option value="ruby">Ruby</option>
      <option value="php">PHP</option>
      <option value="java">Java</option>
    </select>
  );
}

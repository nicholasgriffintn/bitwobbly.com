interface ErrorCardProps {
  message: string;
  className?: string;
}

export function ErrorCard({ message, className = "" }: ErrorCardProps) {
  return <div className={`card error ${className}`.trim()}>{message}</div>;
}

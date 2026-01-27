export function ErrorComponent({
  error,
  reset,
}: {
  error: unknown;
  reset: () => void;
}) {
  return (
    <div className="error-component">
      <span className="error-component__title">Something went wrong!</span>
      <pre className="error-component__message">
        {error instanceof Error ? error.message : String(error)}
      </pre>
      <button onClick={reset} className="error-component__button">
        Try Again
      </button>
    </div>
  );
}

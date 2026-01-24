import { createFileRoute } from '@tanstack/react-router';

function App() {
  return <h1>Hello, World!</h1>;
}

export const Route = createFileRoute('/')({ component: App });

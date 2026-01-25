import { createFileRoute, Link } from "@tanstack/react-router";
import Brand from "@/components/Brand";

function Index() {
  return (
    <div className="auth">
      <div>
        <div className="auth-card">
          <Brand />
          <h1>Monitor your services with confidence</h1>
          <p>
            Real-time uptime monitoring, instant alerts, and beautiful status
            pages. Keep your users informed and your systems healthy.
          </p>
          <Link to="/login">
            <button type="button">Get started</button>
          </Link>
        </div>
        <footer className="auth-footer">
          <p>
            Created by{" "}
            <a
              href="https://nicholasgriffin.dev/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Nicholas Griffin
            </a>
            {" • "}
            <a
              href="https://github.com/nicholasgriffintn/bitwobbly.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              View on GitHub
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/")({ component: Index });

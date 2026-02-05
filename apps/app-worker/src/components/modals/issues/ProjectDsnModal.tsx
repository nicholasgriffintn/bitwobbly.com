import { Modal } from "@/components/Modal";
import { CopyButton } from "@/components/CopyButton";

interface ProjectDsnModalProps {
  isOpen: boolean;
  onClose: () => void;
  dsn: string | null;
  publicKey: string | null;
  secretKey: string | null;
  otlpTracesEndpoint: string | null;
  otlpLogsEndpoint: string | null;
  otlpAuthHeader: string | null;
}

export function ProjectDsnModal({
  isOpen,
  onClose,
  dsn,
  publicKey,
  secretKey,
  otlpTracesEndpoint,
  otlpLogsEndpoint,
  otlpAuthHeader,
}: ProjectDsnModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Project DSN">
      <div className="form">
        <div className="dsn-config">
          <div className="dsn-config-header">
            <span>✓</span>
            SDK Configuration
          </div>

          <div className="dsn-field">
            <div className="flex items-center justify-between">
              <label>DSN</label>
              <CopyButton text={dsn || ""} />
            </div>
            <input
              readOnly
              value={dsn || ""}
              onClick={(e) => e.currentTarget.select()}
              className="dsn-input"
            />
          </div>

          <div className="dsn-field">
            <div className="flex items-center justify-between">
              <label>Public Key</label>
              <CopyButton text={publicKey || ""} />
            </div>
            <input
              readOnly
              value={publicKey || ""}
              onClick={(e) => e.currentTarget.select()}
              className="dsn-input"
            />
          </div>

          {secretKey && (
            <div className="dsn-field">
              <div className="flex items-center justify-between">
                <label>Secret Key</label>
                <CopyButton text={secretKey} />
              </div>
              <input
                readOnly
                value={secretKey}
                onClick={(e) => e.currentTarget.select()}
                className="dsn-input"
              />
            </div>
          )}
        </div>
        <div className="dsn-config">
          <div className="dsn-config-header">
            <span>✓</span>
            OTLP
          </div>

          <div className="dsn-field">
            <div className="flex items-center justify-between">
              <label>Traces Endpoint</label>
              <CopyButton text={otlpTracesEndpoint || ""} />
            </div>
            <input
              readOnly
              value={otlpTracesEndpoint || ""}
              onClick={(e) => e.currentTarget.select()}
              className="dsn-input"
            />
          </div>

          <div className="dsn-field">
            <div className="flex items-center justify-between">
              <label>Logs Endpoint</label>
              <CopyButton text={otlpLogsEndpoint || ""} />
            </div>
            <input
              readOnly
              value={otlpLogsEndpoint || ""}
              onClick={(e) => e.currentTarget.select()}
              className="dsn-input"
            />
          </div>

          <div className="dsn-field">
            <div className="flex items-center justify-between">
              <label>X-Sentry-Auth Header</label>
              <CopyButton text={otlpAuthHeader || ""} />
            </div>
            <input
              readOnly
              value={otlpAuthHeader || ""}
              onClick={(e) => e.currentTarget.select()}
              className="dsn-input"
            />
          </div>
        </div>
        <div className="button-row">
          <button type="button" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}

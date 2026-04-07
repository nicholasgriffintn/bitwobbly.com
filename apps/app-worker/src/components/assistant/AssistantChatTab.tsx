import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui";
import {
  ASSISTANT_SUGGESTED_PROMPTS,
  type AssistantMessage,
} from "@/lib/ai-assistant-chat";

type AssistantChatTabProps = {
  isInitializing: boolean;
  isEnabled: boolean | null;
  isLoading: boolean;
  canSend: boolean;
  question: string;
  messages: AssistantMessage[];
  showSuggestedPrompts: boolean;
  activeAssistantMessageId: string | null;
  onQuestionChange: (value: string) => void;
  onSend: () => Promise<void>;
  onCancel: () => void;
};

export function AssistantChatTab({
  isInitializing,
  isEnabled,
  isLoading,
  canSend,
  question,
  messages,
  showSuggestedPrompts,
  activeAssistantMessageId,
  onQuestionChange,
  onSend,
  onCancel,
}: AssistantChatTabProps) {
  return (
    <div className="assistant-content assistant-chat-content">
      <div className="assistant-chat-log">
        {isInitializing && <div className="muted">Loading assistant…</div>}

        {isEnabled === false && (
          <div className="assistant-empty-state">
            Assistant is disabled for this team. <Link to="/app/settings">Enable it in Settings.</Link>
          </div>
        )}

        {messages.length === 0 && isEnabled === true && (
          <div className="assistant-empty-state">
            Ask about incidents, monitors, components, status pages,
            notifications, and grouping rules.
          </div>
        )}

        {messages.map((message) => {
          const showStreamingPlaceholder =
            message.id === activeAssistantMessageId &&
            isLoading &&
            !message.content &&
            !message.thinking;

          return (
            <div
              key={message.id}
              className={
                message.role === "assistant"
                  ? "assistant-bubble assistant-bubble-assistant"
                  : "assistant-bubble assistant-bubble-user"
              }
            >
              {message.role === "assistant" ? (
                <div className="assistant-message-stack">
                  {message.thinking ? (
                    <div className="assistant-thinking">
                      <div className="assistant-thinking-label">Thinking</div>
                      <div>{message.thinking}</div>
                    </div>
                  ) : null}
                  <div className="assistant-answer">
                    <div className="assistant-answer-label">Response</div>
                    <div>{message.content || (showStreamingPlaceholder ? "…" : "")}</div>
                  </div>
                </div>
              ) : (
                message.content
              )}
            </div>
          );
        })}
      </div>

      <div className="assistant-composer">
        {showSuggestedPrompts && (
          <div className="assistant-suggestions">
            <div className="assistant-suggestions-title">Suggested prompts</div>
            <div className="assistant-suggestions-list">
              {ASSISTANT_SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="assistant-suggestion-chip"
                  onClick={() => onQuestionChange(prompt)}
                  disabled={!isEnabled || isLoading}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        <label className="assistant-label" htmlFor="assistant-question">
          Ask a question
        </label>
        <textarea
          id="assistant-question"
          className="assistant-input"
          rows={3}
          value={question}
          disabled={isEnabled !== true || isLoading}
          onChange={(event) => onQuestionChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (canSend) void onSend();
            }
          }}
          placeholder="Ask about monitoring, incidents, notifications, or setup guidance…"
        />
        <div className="assistant-composer-actions">
          {isLoading ? (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
            >
              Cancel
            </Button>
          ) : null}
          <Button
            type="button"
            onClick={() => void onSend()}
            disabled={!canSend}
          >
            {isLoading ? "Thinking..." : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";

import { Modal } from "@/components/Modal";
import { FormActions } from "@/components/form";
import {
  createSentryIssueGroupingRuleFn,
  updateSentryIssueGroupingRuleFn,
} from "@/server/functions/sentry";

type IssueGroupingRule = {
  id: string;
  name: string;
  enabled: number;
  matchers: {
    exceptionType?: string;
    level?: string;
    messageIncludes?: string;
    culpritIncludes?: string;
    transactionIncludes?: string;
    frameIncludes?: string;
  } | null;
  fingerprint: string;
};

interface GroupingRuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
  projectId: string;
  rule: IssueGroupingRule | null;
}

function normaliseMatchers(input: {
  exceptionType: string;
  level: string;
  messageIncludes: string;
  culpritIncludes: string;
  transactionIncludes: string;
  frameIncludes: string;
}) {
  const out: Record<string, string> = {};

  if (input.exceptionType.trim())
    out.exceptionType = input.exceptionType.trim();
  if (input.level.trim()) out.level = input.level.trim();
  if (input.messageIncludes.trim())
    out.messageIncludes = input.messageIncludes.trim();
  if (input.culpritIncludes.trim())
    out.culpritIncludes = input.culpritIncludes.trim();
  if (input.transactionIncludes.trim())
    out.transactionIncludes = input.transactionIncludes.trim();
  if (input.frameIncludes.trim())
    out.frameIncludes = input.frameIncludes.trim();

  return Object.keys(out).length ? out : null;
}

export function GroupingRuleModal({
  isOpen,
  onClose,
  onSuccess,
  projectId,
  rule,
}: GroupingRuleModalProps) {
  const isEditing = Boolean(rule);

  const [name, setName] = useState("");
  const [fingerprint, setFingerprint] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [matchers, setMatchers] = useState({
    exceptionType: "",
    level: "",
    messageIncludes: "",
    culpritIncludes: "",
    transactionIncludes: "",
    frameIncludes: "",
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createRule = useServerFn(createSentryIssueGroupingRuleFn);
  const updateRule = useServerFn(updateSentryIssueGroupingRuleFn);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);

    if (!rule) {
      setName("");
      setFingerprint("");
      setEnabled(true);
      setMatchers({
        exceptionType: "",
        level: "",
        messageIncludes: "",
        culpritIncludes: "",
        transactionIncludes: "",
        frameIncludes: "",
      });
      return;
    }

    setName(rule.name);
    setFingerprint(rule.fingerprint);
    setEnabled(rule.enabled === 1);
    setMatchers({
      exceptionType: rule.matchers?.exceptionType ?? "",
      level: rule.matchers?.level ?? "",
      messageIncludes: rule.matchers?.messageIncludes ?? "",
      culpritIncludes: rule.matchers?.culpritIncludes ?? "",
      transactionIncludes: rule.matchers?.transactionIncludes ?? "",
      frameIncludes: rule.matchers?.frameIncludes ?? "",
    });
  }, [isOpen, rule]);

  const handleClose = () => {
    setError(null);
    setIsLoading(false);
    onClose();
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const matchersPayload = normaliseMatchers(matchers);

      if (rule) {
        await updateRule({
          data: {
            projectId,
            ruleId: rule.id,
            name: name.trim(),
            enabled,
            matchers: matchersPayload,
            fingerprint: fingerprint.trim(),
          },
        });
      } else {
        await createRule({
          data: {
            projectId,
            name: name.trim(),
            enabled,
            matchers: matchersPayload,
            fingerprint: fingerprint.trim(),
          },
        });
      }

      await onSuccess();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={isEditing ? "Edit grouping rule" : "Create grouping rule"}
    >
      <form className="form" onSubmit={onSubmit}>
        {error ? <div className="form-error">{error}</div> : null}

        <label htmlFor="grouping-rule-name">Name</label>
        <input
          id="grouping-rule-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Checkout timeouts"
          required
          disabled={isLoading}
        />

        <label htmlFor="grouping-rule-fingerprint">Fingerprint</label>
        <input
          id="grouping-rule-fingerprint"
          value={fingerprint}
          onChange={(e) => setFingerprint(e.target.value)}
          placeholder="checkout-timeout"
          required
          disabled={isLoading}
        />

        <label className="mt-4 flex items-center gap-2 text-sm text-[color:var(--text-secondary)]">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            disabled={isLoading}
          />
          Enabled
        </label>

        <div className="muted mt-4">Matchers (optional)</div>

        <label htmlFor="grouping-rule-exception-type">Exception type</label>
        <input
          id="grouping-rule-exception-type"
          value={matchers.exceptionType}
          onChange={(e) =>
            setMatchers((m) => ({ ...m, exceptionType: e.target.value }))
          }
          placeholder="TypeError"
          disabled={isLoading}
        />

        <label htmlFor="grouping-rule-level">Level</label>
        <input
          id="grouping-rule-level"
          value={matchers.level}
          onChange={(e) =>
            setMatchers((m) => ({ ...m, level: e.target.value }))
          }
          placeholder="error"
          disabled={isLoading}
        />

        <label htmlFor="grouping-rule-message">Message includes</label>
        <input
          id="grouping-rule-message"
          value={matchers.messageIncludes}
          onChange={(e) =>
            setMatchers((m) => ({ ...m, messageIncludes: e.target.value }))
          }
          placeholder="timeout"
          disabled={isLoading}
        />

        <label htmlFor="grouping-rule-culprit">Culprit includes</label>
        <input
          id="grouping-rule-culprit"
          value={matchers.culpritIncludes}
          onChange={(e) =>
            setMatchers((m) => ({ ...m, culpritIncludes: e.target.value }))
          }
          placeholder="checkout.flow"
          disabled={isLoading}
        />

        <label htmlFor="grouping-rule-transaction">Transaction includes</label>
        <input
          id="grouping-rule-transaction"
          value={matchers.transactionIncludes}
          onChange={(e) =>
            setMatchers((m) => ({ ...m, transactionIncludes: e.target.value }))
          }
          placeholder="/checkout"
          disabled={isLoading}
        />

        <label htmlFor="grouping-rule-frame">Frame includes</label>
        <input
          id="grouping-rule-frame"
          value={matchers.frameIncludes}
          onChange={(e) =>
            setMatchers((m) => ({ ...m, frameIncludes: e.target.value }))
          }
          placeholder="src/routes/checkout"
          disabled={isLoading}
        />

        <FormActions>
          <button type="submit" disabled={isLoading}>
            {isLoading
              ? isEditing
                ? "Saving..."
                : "Creating..."
              : isEditing
                ? "Save rule"
                : "Create rule"}
          </button>
          <button
            type="button"
            className="outline"
            onClick={handleClose}
            disabled={isLoading}
          >
            Cancel
          </button>
        </FormActions>
      </form>
    </Modal>
  );
}

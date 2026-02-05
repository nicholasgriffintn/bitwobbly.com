import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import { GroupingRuleModal } from "@/components/modals/issues";
import {
  listSentryIssueGroupingRulesFn,
  updateSentryIssueGroupingRuleFn,
  deleteSentryIssueGroupingRuleFn,
} from "@/server/functions/sentry";
import type { IssueGroupingRule } from "@/types/issues";

interface GroupingTabProps {
  projectId: string;
  initialRules: IssueGroupingRule[];
}

export function GroupingTab({ projectId, initialRules }: GroupingTabProps) {
  const [groupingRules, setGroupingRules] =
    useState<IssueGroupingRule[]>(initialRules);
  const [isGroupingRuleModalOpen, setIsGroupingRuleModalOpen] = useState(false);
  const [editingGroupingRule, setEditingGroupingRule] =
    useState<IssueGroupingRule | null>(null);

  const listGroupingRules = useServerFn(listSentryIssueGroupingRulesFn);
  const updateGroupingRule = useServerFn(updateSentryIssueGroupingRuleFn);
  const deleteGroupingRule = useServerFn(deleteSentryIssueGroupingRuleFn);

  const refreshGroupingRules = async () => {
    const res = await listGroupingRules({ data: { projectId } });
    setGroupingRules(res.rules);
  };

  const openCreateGroupingRule = () => {
    setEditingGroupingRule(null);
    setIsGroupingRuleModalOpen(true);
  };

  const openEditGroupingRule = (rule: IssueGroupingRule) => {
    setEditingGroupingRule(rule);
    setIsGroupingRuleModalOpen(true);
  };

  const closeGroupingRuleModal = () => {
    setIsGroupingRuleModalOpen(false);
    setEditingGroupingRule(null);
  };

  const handleToggleGroupingRule = async (ruleId: string, enabled: boolean) => {
    await updateGroupingRule({ data: { projectId, ruleId, enabled } });
    await refreshGroupingRules();
  };

  const handleDeleteGroupingRule = async (ruleId: string) => {
    if (!confirm("Delete this grouping rule?")) return;
    await deleteGroupingRule({ data: { projectId, ruleId } });
    await refreshGroupingRules();
  };

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Grouping Rules</div>
          <div className="muted">
            Override grouping per project without deploying code.
          </div>
        </div>
        <button
          type="button"
          className="outline"
          onClick={openCreateGroupingRule}
        >
          New rule
        </button>
      </div>
      <div className="list">
        {groupingRules.length ? (
          groupingRules.map((rule) => (
            <div key={rule.id} className="list-item-expanded">
              <div className="list-row">
                <div className="flex-1">
                  <div className="list-title">
                    {rule.name}
                    <span className="pill small ml-2">
                      {rule.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                  <div className="muted mt-1">
                    Fingerprint: <code>{rule.fingerprint}</code>
                    {rule.matchers ? (
                      <>
                        {" · "}
                        Matchers: <code>{JSON.stringify(rule.matchers)}</code>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="button-row">
                  <button
                    type="button"
                    className="outline"
                    onClick={() =>
                      handleToggleGroupingRule(rule.id, !(rule.enabled === 1))
                    }
                  >
                    {rule.enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    type="button"
                    className="outline"
                    onClick={() => openEditGroupingRule(rule)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="outline button-danger"
                    onClick={() => handleDeleteGroupingRule(rule.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="muted">No grouping rules yet.</div>
        )}
      </div>

      <GroupingRuleModal
        isOpen={isGroupingRuleModalOpen}
        onClose={closeGroupingRuleModal}
        onSuccess={refreshGroupingRules}
        projectId={projectId}
        rule={editingGroupingRule}
      />
    </div>
  );
}

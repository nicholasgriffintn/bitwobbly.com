import { and, desc, eq, inArray, ne } from "drizzle-orm";

import type { DB } from "../../db/index.ts";
import { schema } from "../../db/index.ts";
import { toRecordOrNull } from "../type-guards.ts";
import { clampInt, objectKeys, safeJsonParse } from "../utils.ts";
import { MAX_MAX_CONTEXT_ITEMS, MIN_MAX_CONTEXT_ITEMS } from "./constants.ts";
import type {
  AlertRuleContextItem,
  ComponentContextItem,
  GroupingRuleContextItem,
  IncidentContextItem,
  MonitorContextItem,
  NotificationChannelContextItem,
  SentryIssueContextItem,
  TeamAiAssistantContextSnapshot,
  TeamAiAssistantSettings,
} from "./types.ts";

function sanitiseMonitorUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const safePath = parsed.pathname || "/";
    return `${parsed.protocol}//${parsed.host}${safePath}`;
  } catch {
    return url.length <= 120 ? url : `${url.slice(0, 117)}...`;
  }
}

function normaliseMonitorStatus(value: string | null | undefined): string {
  if (value === "up" || value === "down" || value === "unknown") return value;
  return "unknown";
}

function sliceItems<T>(items: T[], maxItems: number): T[] {
  return items.slice(
    0,
    clampInt(maxItems, MIN_MAX_CONTEXT_ITEMS, MAX_MAX_CONTEXT_ITEMS)
  );
}

export async function buildTeamAiAssistantContextSnapshot(
  db: DB,
  teamId: string,
  settings: TeamAiAssistantSettings
): Promise<TeamAiAssistantContextSnapshot> {
  const maxItems = clampInt(
    settings.maxContextItems,
    MIN_MAX_CONTEXT_ITEMS,
    MAX_MAX_CONTEXT_ITEMS
  );

  const teamRows = await db
    .select({ id: schema.teams.id, name: schema.teams.name })
    .from(schema.teams)
    .where(eq(schema.teams.id, teamId))
    .limit(1);
  if (!teamRows.length) {
    throw new Error("Team not found");
  }

  const snapshot: TeamAiAssistantContextSnapshot = {
    capturedAt: Math.floor(Date.now() / 1000),
    team: {
      id: teamRows[0].id,
      name: teamRows[0].name,
    },
  };

  if (settings.includeMonitors) {
    const monitorRows = await db
      .select({
        id: schema.monitors.id,
        name: schema.monitors.name,
        type: schema.monitors.type,
        enabled: schema.monitors.enabled,
        intervalSeconds: schema.monitors.intervalSeconds,
        failureThreshold: schema.monitors.failureThreshold,
        url: schema.monitors.url,
        lastStatus: schema.monitorState.lastStatus,
        lastCheckedAt: schema.monitorState.lastCheckedAt,
        lastLatencyMs: schema.monitorState.lastLatencyMs,
        lastError: schema.monitorState.lastError,
      })
      .from(schema.monitors)
      .leftJoin(
        schema.monitorState,
        eq(schema.monitorState.monitorId, schema.monitors.id)
      )
      .where(eq(schema.monitors.teamId, teamId));

    const summary = {
      total: monitorRows.length,
      enabled: 0,
      up: 0,
      down: 0,
      unknown: 0,
    };

    const items = monitorRows.map<MonitorContextItem>((row) => {
      const status = normaliseMonitorStatus(row.lastStatus);
      if (row.enabled === 1) summary.enabled += 1;
      if (status === "up") summary.up += 1;
      if (status === "down") summary.down += 1;
      if (status === "unknown") summary.unknown += 1;

      return {
        id: row.id,
        name: row.name,
        type: row.type,
        enabled: row.enabled === 1,
        status,
        intervalSeconds: Number(row.intervalSeconds) || 60,
        failureThreshold: Number(row.failureThreshold) || 3,
        lastCheckedAt: Number(row.lastCheckedAt) || 0,
        latencyMs:
          row.lastLatencyMs === null || row.lastLatencyMs === undefined
            ? null
            : Number(row.lastLatencyMs),
        lastError: row.lastError || null,
        url: sanitiseMonitorUrl(row.url),
      };
    });

    items.sort((a, b) => {
      const rank = (status: string): number => {
        if (status === "down") return 0;
        if (status === "unknown") return 1;
        return 2;
      };
      return rank(a.status) - rank(b.status) || a.name.localeCompare(b.name);
    });

    snapshot.monitors = { summary, items: sliceItems(items, maxItems) };
  }

  if (settings.includeComponents) {
    const componentRows = await db
      .select({
        id: schema.components.id,
        name: schema.components.name,
        status: schema.components.currentStatus,
        updatedAt: schema.components.statusUpdatedAt,
      })
      .from(schema.components)
      .where(eq(schema.components.teamId, teamId));

    const summary: Record<string, number> = {};
    for (const row of componentRows) {
      const key = row.status || "unknown";
      summary[key] = (summary[key] || 0) + 1;
    }

    const items = componentRows
      .map<ComponentContextItem>((row) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        updatedAt:
          row.updatedAt === null || row.updatedAt === undefined
            ? null
            : Number(row.updatedAt),
      }))
      .sort((a, b) => {
        const rank = (status: string): number => {
          if (status === "down") return 0;
          if (status === "degraded") return 1;
          if (status === "maintenance") return 2;
          return 3;
        };
        return rank(a.status) - rank(b.status) || a.name.localeCompare(b.name);
      });

    snapshot.components = {
      summary,
      items: sliceItems(items, maxItems),
    };
  }

  if (settings.includeIssues) {
    const openIncidents = await db
      .select({
        id: schema.incidents.id,
        title: schema.incidents.title,
        status: schema.incidents.status,
        startedAt: schema.incidents.startedAt,
        resolvedAt: schema.incidents.resolvedAt,
        monitorId: schema.incidents.monitorId,
        statusPageId: schema.incidents.statusPageId,
      })
      .from(schema.incidents)
      .where(
        and(
          eq(schema.incidents.teamId, teamId),
          ne(schema.incidents.status, "resolved")
        )
      )
      .orderBy(desc(schema.incidents.startedAt))
      .limit(maxItems);

    const sentryIssues = await db
      .select({
        id: schema.sentryIssues.id,
        projectId: schema.sentryProjects.id,
        projectName: schema.sentryProjects.name,
        title: schema.sentryIssues.title,
        level: schema.sentryIssues.level,
        status: schema.sentryIssues.status,
        eventCount: schema.sentryIssues.eventCount,
        userCount: schema.sentryIssues.userCount,
        lastSeenAt: schema.sentryIssues.lastSeenAt,
      })
      .from(schema.sentryIssues)
      .innerJoin(
        schema.sentryProjects,
        eq(schema.sentryIssues.projectId, schema.sentryProjects.id)
      )
      .where(
        and(
          eq(schema.sentryProjects.teamId, teamId),
          ne(schema.sentryIssues.status, "resolved")
        )
      )
      .orderBy(desc(schema.sentryIssues.lastSeenAt))
      .limit(maxItems);

    snapshot.incidents = {
      open: openIncidents.map<IncidentContextItem>((row) => ({
        id: row.id,
        title: row.title,
        status: row.status,
        startedAt: Number(row.startedAt) || 0,
        resolvedAt:
          row.resolvedAt === null || row.resolvedAt === undefined
            ? null
            : Number(row.resolvedAt),
        monitorId: row.monitorId ?? null,
        statusPageId: row.statusPageId ?? null,
      })),
      sentryIssues: sentryIssues.map<SentryIssueContextItem>((row) => ({
        id: row.id,
        projectId: row.projectId,
        projectName: row.projectName,
        title: row.title,
        level: row.level,
        status: row.status,
        eventCount: Number(row.eventCount) || 0,
        userCount: Number(row.userCount) || 0,
        lastSeenAt: Number(row.lastSeenAt) || 0,
      })),
    };
  }

  if (settings.includeStatusPages) {
    const pages = await db
      .select({
        id: schema.statusPages.id,
        name: schema.statusPages.name,
        slug: schema.statusPages.slug,
        isPublic: schema.statusPages.isPublic,
        accessMode: schema.statusPages.accessMode,
      })
      .from(schema.statusPages)
      .where(eq(schema.statusPages.teamId, teamId));

    const pageIds = pages.map((p) => p.id);
    const links =
      pageIds.length > 0
        ? await db
            .select({
              statusPageId: schema.statusPageComponents.statusPageId,
            })
            .from(schema.statusPageComponents)
            .where(inArray(schema.statusPageComponents.statusPageId, pageIds))
        : [];

    const countByPage = new Map<string, number>();
    for (const link of links) {
      countByPage.set(
        link.statusPageId,
        (countByPage.get(link.statusPageId) || 0) + 1
      );
    }

    snapshot.statusPages = {
      total: pages.length,
      items: sliceItems(
        pages.map((page) => ({
          id: page.id,
          name: page.name,
          slug: page.slug,
          isPublic: Number(page.isPublic) === 1,
          accessMode: page.accessMode,
          componentCount: countByPage.get(page.id) || 0,
        })),
        maxItems
      ),
    };
  }

  if (settings.includeNotifications) {
    const [channels, alertRules] = await Promise.all([
      db
        .select({
          id: schema.notificationChannels.id,
          type: schema.notificationChannels.type,
          enabled: schema.notificationChannels.enabled,
          configJson: schema.notificationChannels.configJson,
        })
        .from(schema.notificationChannels)
        .where(eq(schema.notificationChannels.teamId, teamId)),
      db
        .select({
          id: schema.alertRules.id,
          name: schema.alertRules.name,
          enabled: schema.alertRules.enabled,
          sourceType: schema.alertRules.sourceType,
          triggerType: schema.alertRules.triggerType,
          projectId: schema.alertRules.projectId,
          monitorId: schema.alertRules.monitorId,
          actionIntervalSeconds: schema.alertRules.actionIntervalSeconds,
          channelType: schema.notificationChannels.type,
        })
        .from(schema.alertRules)
        .leftJoin(
          schema.notificationChannels,
          eq(schema.alertRules.channelId, schema.notificationChannels.id)
        )
        .where(eq(schema.alertRules.teamId, teamId)),
    ]);

    const channelItems = channels
      .map<NotificationChannelContextItem>((channel) => ({
        id: channel.id,
        type: channel.type,
        enabled: Number(channel.enabled) === 1,
        configKeys: objectKeys(safeJsonParse(channel.configJson)),
      }))
      .sort((a, b) => a.type.localeCompare(b.type));

    const alertRuleItems = alertRules
      .map<AlertRuleContextItem>((row) => ({
        id: row.id,
        name: row.name,
        enabled: Number(row.enabled) === 1,
        sourceType: row.sourceType,
        triggerType: row.triggerType,
        projectId: row.projectId ?? null,
        monitorId: row.monitorId ?? null,
        channelType: row.channelType ?? null,
        actionIntervalSeconds: Number(row.actionIntervalSeconds) || 0,
      }))
      .sort((a, b) => {
        if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    snapshot.notifications = {
      channels: sliceItems(channelItems, maxItems),
      alertRules: sliceItems(alertRuleItems, maxItems),
      summary: {
        channelsTotal: channels.length,
        channelsEnabled: channels.filter((c) => Number(c.enabled) === 1).length,
        alertRulesTotal: alertRules.length,
        alertRulesEnabled: alertRules.filter((r) => Number(r.enabled) === 1)
          .length,
        monitorRules: alertRules.filter((r) => r.sourceType === "monitor")
          .length,
        issueRules: alertRules.filter((r) => r.sourceType !== "monitor").length,
      },
    };
  }

  if (settings.includeGroupingRules) {
    const rules = await db
      .select({
        id: schema.sentryIssueGroupingRules.id,
        projectId: schema.sentryProjects.id,
        projectName: schema.sentryProjects.name,
        name: schema.sentryIssueGroupingRules.name,
        enabled: schema.sentryIssueGroupingRules.enabled,
        fingerprint: schema.sentryIssueGroupingRules.fingerprint,
        matchers: schema.sentryIssueGroupingRules.matchers,
      })
      .from(schema.sentryIssueGroupingRules)
      .innerJoin(
        schema.sentryProjects,
        eq(schema.sentryIssueGroupingRules.projectId, schema.sentryProjects.id)
      )
      .where(eq(schema.sentryProjects.teamId, teamId))
      .orderBy(desc(schema.sentryIssueGroupingRules.createdAt));

    const countByProject = new Map<
      string,
      { projectName: string; rules: number }
    >();
    for (const rule of rules) {
      const current = countByProject.get(rule.projectId);
      if (current) {
        current.rules += 1;
      } else {
        countByProject.set(rule.projectId, {
          projectName: rule.projectName,
          rules: 1,
        });
      }
    }

    snapshot.groupingRules = {
      total: rules.length,
      enabled: rules.filter((r) => Number(r.enabled) === 1).length,
      projectCounts: Array.from(countByProject.entries()).map(
        ([projectId, value]) => ({
          projectId,
          projectName: value.projectName,
          rules: value.rules,
        })
      ),
      items: sliceItems(
        rules.map<GroupingRuleContextItem>((row) => ({
          id: row.id,
          projectId: row.projectId,
          projectName: row.projectName,
          name: row.name,
          enabled: Number(row.enabled) === 1,
          fingerprint: row.fingerprint,
          matchers: toRecordOrNull(row.matchers),
        })),
        maxItems
      ),
    };
  }

  return snapshot;
}

export function buildTeamAiAssistantContextSummary(
  snapshot: TeamAiAssistantContextSnapshot
): Record<string, unknown> {
  return {
    capturedAt: snapshot.capturedAt,
    teamId: snapshot.team.id,
    monitors: snapshot.monitors?.summary,
    components: snapshot.components?.summary,
    openIncidents: snapshot.incidents?.open.length ?? 0,
    openSentryIssues: snapshot.incidents?.sentryIssues.length ?? 0,
    statusPages: snapshot.statusPages?.total ?? 0,
    notificationChannels: snapshot.notifications?.summary.channelsTotal ?? 0,
    alertRules: snapshot.notifications?.summary.alertRulesTotal ?? 0,
    groupingRules: snapshot.groupingRules?.total ?? 0,
  };
}

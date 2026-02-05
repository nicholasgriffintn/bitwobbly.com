export type TeamMember = {
  userId: string;
  email: string;
  role: string;
  joinedAt: string;
};

export type Issue = {
  id: string;
  fingerprint: string;
  title: string;
  level: string;
  status: string;
  culprit: string | null;
  assignedToUserId: string | null;
  assignedAt: number | null;
  snoozedUntil: number | null;
  ignoredUntil: number | null;
  resolvedInRelease: string | null;
  regressedAt: number | null;
  regressedCount: number;
  eventCount: number;
  userCount: number;
  firstSeenAt: number;
  lastSeenAt: number;
  lastSeenRelease: string | null;
  lastSeenEnvironment: string | null;
  resolvedAt: number | null;
  createdAt: string;
};

export type Event = {
  id: string;
  type: string;
  level: string | null;
  message: string | null;
  transaction?: string | null;
  receivedAt: number;
  issueId: string | null;
  release?: string | null;
  environment?: string | null;
  user?: {
    id?: string;
    username?: string;
    email?: string;
    ip_address?: string;
  } | null;
  tags?: Record<string, string> | null;
  contexts?: Record<string, Record<string, unknown>> | null;
  request?: {
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    data?: Record<string, unknown>;
  } | null;
  exception?: {
    values?: Array<{
      type?: string;
      value?: string;
      mechanism?: Record<string, unknown>;
      stacktrace?: {
        frames?: Array<{
          filename?: string;
          function?: string;
          lineno?: number;
          colno?: number;
          in_app?: boolean;
          context_line?: string;
          pre_context?: string[];
          post_context?: string[];
        }>;
      };
    }>;
  } | null;
  breadcrumbs?: Array<{
    timestamp?: string;
    type?: string;
    category?: string;
    message?: string;
    level?: string;
    data?: Record<string, unknown>;
  }> | null;
};

export type IssueGroupingRule = {
  id: string;
  name: string;
  enabled: number;
  matchers: {
    exceptionType?: string;
    level?: string;
    messageIncludes?: string;
    culpritIncludes?: string;
    transactionIncludes?: string;
  } | null;
  fingerprint: string;
  createdAt: string;
};

export const supportsResolution = (level: string): boolean =>
  level === "error" || level === "warning";

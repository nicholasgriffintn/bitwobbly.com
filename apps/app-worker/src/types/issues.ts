export type TeamMember = {
  userId: string;
  email: string;
  role: string;
  joinedAt: string;
};

export type Issue = {
  id: string;
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
};

export type Event = {
  id: string;
  type: string;
  level: string | null;
  message: string | null;
  receivedAt: number;
  issueId: string | null;
  user?: {
    id?: string;
    username?: string;
    email?: string;
    ip_address?: string;
  } | null;
  tags?: Record<string, string> | null;
  contexts?: {
    device?: { [key: string]: {} };
    os?: { [key: string]: {} };
    runtime?: { [key: string]: {} };
    browser?: { [key: string]: {} };
    app?: { [key: string]: {} };
  } | null;
  request?: {
    url?: string;
    method?: string;
  } | null;
  breadcrumbs?: Array<{
    timestamp?: string;
    type?: string;
    category?: string;
    message?: string;
    level?: string;
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

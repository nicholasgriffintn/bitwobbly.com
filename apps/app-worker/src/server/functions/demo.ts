import { createServerFn } from '@tanstack/react-start';
import { env } from 'cloudflare:workers';
import { and, desc, eq, inArray, ne } from 'drizzle-orm';

import { requireOwner } from '@bitwobbly/auth/server';
import { hashWebhookToken, schema } from '@bitwobbly/shared';

import { getDb } from '../lib/db';
import { hashPassword } from '../lib/auth';
import { requireTeam } from '../lib/auth-middleware';
import {
  getPublicStatusSnapshotCacheKey,
  getTeamStatusSnapshotCacheKey,
} from '../lib/status-snapshot-cache';

const DAY_SECONDS = 24 * 60 * 60;

function unixToIso(seconds: number): string {
  return new Date(seconds * 1000).toISOString();
}

function demoId(prefix: string, key: string, name: string): string {
  return `${prefix}_demo_${key}_${name}`;
}

export const seedDemoDataFn = createServerFn({ method: 'POST' }).handler(
  async () => {
    const { userId: actorId, teamId } = await requireTeam();
    const db = getDb(env.DB);

    await requireOwner(db, teamId, actorId);

    const key = teamId.replace(/[^a-zA-Z0-9]/g, '').slice(-8) || 'team';
    const now = Math.floor(Date.now() / 1000);
    const createdAt = unixToIso(now);

    const existingMonitors = await db
      .select({ id: schema.monitors.id })
      .from(schema.monitors)
      .where(eq(schema.monitors.teamId, teamId));
    const monitorIds = existingMonitors.map((row) => row.id);

    const existingStatusPages = await db
      .select({ id: schema.statusPages.id, slug: schema.statusPages.slug })
      .from(schema.statusPages)
      .where(eq(schema.statusPages.teamId, teamId));
    const statusPageIds = existingStatusPages.map((row) => row.id);

    const existingComponents = await db
      .select({ id: schema.components.id })
      .from(schema.components)
      .where(eq(schema.components.teamId, teamId));
    const componentIds = existingComponents.map((row) => row.id);

    const existingIncidents = await db
      .select({ id: schema.incidents.id })
      .from(schema.incidents)
      .where(eq(schema.incidents.teamId, teamId));
    const incidentIds = existingIncidents.map((row) => row.id);

    const existingRules = await db
      .select({ id: schema.alertRules.id })
      .from(schema.alertRules)
      .where(eq(schema.alertRules.teamId, teamId));
    const ruleIds = existingRules.map((row) => row.id);

    const existingProjects = await db
      .select({ id: schema.sentryProjects.id })
      .from(schema.sentryProjects)
      .where(eq(schema.sentryProjects.teamId, teamId));
    const projectIds = existingProjects.map((row) => row.id);

    if (projectIds.length) {
      const eventRows = await db
        .select({ r2Key: schema.sentryEvents.r2Key })
        .from(schema.sentryEvents)
        .where(inArray(schema.sentryEvents.projectId, projectIds));
      await Promise.all(
        eventRows.map((row) => env.SENTRY_RAW.delete(row.r2Key)),
      );
    }

    await Promise.all(
      existingStatusPages.flatMap((page) => [
        env.KV.delete(getTeamStatusSnapshotCacheKey(teamId, page.slug)),
        env.KV.delete(getPublicStatusSnapshotCacheKey(page.slug)),
      ]),
    );

    if (ruleIds.length) {
      await db
        .delete(schema.alertRuleFires)
        .where(inArray(schema.alertRuleFires.ruleId, ruleIds));
      await db
        .delete(schema.alertRuleStates)
        .where(inArray(schema.alertRuleStates.ruleId, ruleIds));
    }

    if (incidentIds.length) {
      await db
        .delete(schema.incidentUpdates)
        .where(inArray(schema.incidentUpdates.incidentId, incidentIds));
      await db
        .delete(schema.incidentComponents)
        .where(inArray(schema.incidentComponents.incidentId, incidentIds));
    }

    if (statusPageIds.length) {
      await db
        .delete(schema.statusPageComponents)
        .where(
          inArray(schema.statusPageComponents.statusPageId, statusPageIds),
        );
    }

    if (componentIds.length) {
      await db
        .delete(schema.componentMonitors)
        .where(inArray(schema.componentMonitors.componentId, componentIds));
    }

    if (monitorIds.length) {
      await db
        .delete(schema.monitorState)
        .where(inArray(schema.monitorState.monitorId, monitorIds));
      await db
        .delete(schema.componentMonitors)
        .where(inArray(schema.componentMonitors.monitorId, monitorIds));
    }

    if (projectIds.length) {
      await db
        .delete(schema.sentryClientReports)
        .where(inArray(schema.sentryClientReports.projectId, projectIds));
      await db
        .delete(schema.sentrySessions)
        .where(inArray(schema.sentrySessions.projectId, projectIds));
      await db
        .delete(schema.sentryEvents)
        .where(inArray(schema.sentryEvents.projectId, projectIds));
      await db
        .delete(schema.sentryIssues)
        .where(inArray(schema.sentryIssues.projectId, projectIds));
      await db
        .delete(schema.sentryKeys)
        .where(inArray(schema.sentryKeys.projectId, projectIds));
    }

    await db
      .delete(schema.alertRules)
      .where(eq(schema.alertRules.teamId, teamId));
    await db
      .delete(schema.incidents)
      .where(eq(schema.incidents.teamId, teamId));
    await db
      .delete(schema.teamInvites)
      .where(eq(schema.teamInvites.teamId, teamId));
    await db
      .delete(schema.statusPages)
      .where(eq(schema.statusPages.teamId, teamId));
    await db
      .delete(schema.components)
      .where(eq(schema.components.teamId, teamId));
    await db.delete(schema.monitors).where(eq(schema.monitors.teamId, teamId));
    await db
      .delete(schema.notificationChannels)
      .where(eq(schema.notificationChannels.teamId, teamId));
    await db
      .delete(schema.sentryProjects)
      .where(eq(schema.sentryProjects.teamId, teamId));

    const demoUserOwnerId = demoId('usr', key, 'owner');
    const demoUserMemberId = demoId('usr', key, 'member');
    const demoUserViewerId = demoId('usr', key, 'viewer');
    const demoUserIds = [demoUserOwnerId, demoUserMemberId, demoUserViewerId];

    await db
      .delete(schema.sessions)
      .where(inArray(schema.sessions.userId, demoUserIds));
    await db
      .delete(schema.userTeams)
      .where(inArray(schema.userTeams.userId, demoUserIds));
    await db.delete(schema.users).where(inArray(schema.users.id, demoUserIds));

    await db
      .update(schema.teams)
      .set({ name: 'Acme Retail Demo', createdAt })
      .where(eq(schema.teams.id, teamId));

    await db.insert(schema.users).values([
      {
        id: demoUserOwnerId,
        email: `owner.${key}@demo.bitwobbly.local`,
        passwordHash: null,
        teamId,
        currentTeamId: teamId,
        authProvider: 'custom',
        cognitoSub: null,
        mfaEnabled: 0,
        emailVerified: 1,
        createdAt,
      },
      {
        id: demoUserMemberId,
        email: `sre.${key}@demo.bitwobbly.local`,
        passwordHash: null,
        teamId,
        currentTeamId: teamId,
        authProvider: 'custom',
        cognitoSub: null,
        mfaEnabled: 0,
        emailVerified: 1,
        createdAt,
      },
      {
        id: demoUserViewerId,
        email: `support.${key}@demo.bitwobbly.local`,
        passwordHash: null,
        teamId,
        currentTeamId: teamId,
        authProvider: 'custom',
        cognitoSub: null,
        mfaEnabled: 1,
        emailVerified: 1,
        createdAt,
      },
    ]);

    await db
      .insert(schema.userTeams)
      .values([
        {
          userId: demoUserOwnerId,
          teamId,
          role: 'owner',
          joinedAt: unixToIso(now - 120 * DAY_SECONDS),
        },
        {
          userId: demoUserMemberId,
          teamId,
          role: 'member',
          joinedAt: unixToIso(now - 95 * DAY_SECONDS),
        },
        {
          userId: demoUserViewerId,
          teamId,
          role: 'member',
          joinedAt: unixToIso(now - 30 * DAY_SECONDS),
        },
      ])
      .onConflictDoNothing();

    await db.insert(schema.sessions).values([
      {
        id: demoId('sess', key, 'owner'),
        userId: demoUserOwnerId,
        expiresAt: now + 7 * DAY_SECONDS,
      },
      {
        id: demoId('sess', key, 'member'),
        userId: demoUserMemberId,
        expiresAt: now + 5 * DAY_SECONDS,
      },
      {
        id: demoId('sess', key, 'viewer'),
        userId: demoUserViewerId,
        expiresAt: now + 3 * DAY_SECONDS,
      },
    ]);

    await db.insert(schema.teamInvites).values([
      {
        id: demoId('inv', key, 'active_owner'),
        teamId,
        email: `new.owner.${key}@example.com`,
        inviteCode: demoId('code', key, 'active_owner'),
        role: 'owner',
        createdBy: actorId,
        createdAt: unixToIso(now - DAY_SECONDS),
        expiresAt: unixToIso(now + 6 * DAY_SECONDS),
        usedAt: null,
      },
      {
        id: demoId('inv', key, 'active_member'),
        teamId,
        email: `new.member.${key}@example.com`,
        inviteCode: demoId('code', key, 'active_member'),
        role: 'member',
        createdBy: actorId,
        createdAt: unixToIso(now - 2 * DAY_SECONDS),
        expiresAt: unixToIso(now + 5 * DAY_SECONDS),
        usedAt: null,
      },
      {
        id: demoId('inv', key, 'used'),
        teamId,
        email: `used.${key}@example.com`,
        inviteCode: demoId('code', key, 'used'),
        role: 'member',
        createdBy: actorId,
        createdAt: unixToIso(now - 18 * DAY_SECONDS),
        expiresAt: unixToIso(now - 8 * DAY_SECONDS),
        usedAt: unixToIso(now - 15 * DAY_SECONDS),
      },
    ]);

    const monitorApiId = demoId('mon', key, 'api');
    const monitorCheckoutId = demoId('mon', key, 'checkout');
    const monitorWebhookId = demoId('mon', key, 'webhook');
    const monitorManualId = demoId('mon', key, 'manual');
    const monitorExternalId = demoId('mon', key, 'external');
    const monitorKeywordId = demoId('mon', key, 'keyword');
    const monitorAssertionsId = demoId('mon', key, 'assertions');
    const monitorTlsId = demoId('mon', key, 'tls');
    const monitorDnsId = demoId('mon', key, 'dns');
    const monitorTcpId = demoId('mon', key, 'tcp');
    const monitorHeartbeatId = demoId('mon', key, 'heartbeat');

    const webhookTokenHash = await hashWebhookToken(
      `demo-webhook-token-${key}`,
    );
    const heartbeatTokenHash = await hashWebhookToken(
      `demo-heartbeat-token-${key}`,
    );

    const demoMonitors = [
      {
        id: monitorApiId,
        teamId,
        name: 'API Gateway',
        url: 'https://demo-api.bitwobbly.com/health',
        method: 'GET',
        timeoutMs: 5000,
        intervalSeconds: 60,
        failureThreshold: 3,
        enabled: 1,
        nextRunAt: now + 45,
        lockedUntil: 0,
        type: 'http',
        webhookToken: null,
        externalConfig: null,
        createdAt: unixToIso(now - 90 * DAY_SECONDS),
      },
      {
        id: monitorCheckoutId,
        teamId,
        name: 'Checkout API',
        url: 'https://demo-api.bitwobbly.com/checkout/health',
        method: 'GET',
        timeoutMs: 8000,
        intervalSeconds: 60,
        failureThreshold: 2,
        enabled: 1,
        nextRunAt: now + 20,
        lockedUntil: 0,
        type: 'http',
        webhookToken: null,
        externalConfig: null,
        createdAt: unixToIso(now - 65 * DAY_SECONDS),
      },
      {
        id: monitorAssertionsId,
        teamId,
        name: 'API Health (Assertions)',
        url: 'https://demo-api.bitwobbly.com/health',
        method: 'GET',
        timeoutMs: 5000,
        intervalSeconds: 60,
        failureThreshold: 2,
        enabled: 1,
        nextRunAt: now + 55,
        lockedUntil: 0,
        type: 'http_assert',
        webhookToken: null,
        externalConfig: JSON.stringify({
          expectedStatus: [200],
          bodyIncludes: 'ok',
        }),
        createdAt: unixToIso(now - 30 * DAY_SECONDS),
      },
      {
        id: monitorKeywordId,
        teamId,
        name: 'Docs Keyword (Match)',
        url: 'https://example.com',
        method: 'GET',
        timeoutMs: 8000,
        intervalSeconds: 120,
        failureThreshold: 2,
        enabled: 1,
        nextRunAt: now + 35,
        lockedUntil: 0,
        type: 'http_keyword',
        webhookToken: null,
        externalConfig: JSON.stringify({
          keyword: 'example',
          caseSensitive: false,
        }),
        createdAt: unixToIso(now - 25 * DAY_SECONDS),
      },
      {
        id: monitorTlsId,
        teamId,
        name: 'TLS Certificate (Expiry)',
        url: 'example.com:443',
        method: 'GET',
        timeoutMs: 8000,
        intervalSeconds: 3600,
        failureThreshold: 1,
        enabled: 1,
        nextRunAt: now + 250,
        lockedUntil: 0,
        type: 'tls',
        webhookToken: null,
        externalConfig: JSON.stringify({
          minDaysRemaining: 14,
          allowInvalid: false,
        }),
        createdAt: unixToIso(now - 8 * DAY_SECONDS),
      },
      {
        id: monitorDnsId,
        teamId,
        name: 'DNS (DoH)',
        url: 'example.com',
        method: 'GET',
        timeoutMs: 6000,
        intervalSeconds: 300,
        failureThreshold: 2,
        enabled: 1,
        nextRunAt: now + 190,
        lockedUntil: 0,
        type: 'dns',
        webhookToken: null,
        externalConfig: JSON.stringify({
          recordType: 'A',
          expectedIncludes: '.',
        }),
        createdAt: unixToIso(now - 6 * DAY_SECONDS),
      },
      {
        id: monitorTcpId,
        teamId,
        name: 'TCP (Connect)',
        url: 'example.com:443',
        method: 'GET',
        timeoutMs: 5000,
        intervalSeconds: 120,
        failureThreshold: 2,
        enabled: 1,
        nextRunAt: now + 140,
        lockedUntil: 0,
        type: 'tcp',
        webhookToken: null,
        externalConfig: null,
        createdAt: unixToIso(now - 5 * DAY_SECONDS),
      },
      {
        id: monitorHeartbeatId,
        teamId,
        name: 'Cron Heartbeat',
        url: null,
        method: 'GET',
        timeoutMs: 8000,
        intervalSeconds: 300,
        failureThreshold: 1,
        enabled: 1,
        nextRunAt: now + 300,
        lockedUntil: 0,
        type: 'heartbeat',
        webhookToken: heartbeatTokenHash,
        externalConfig: JSON.stringify({ graceSeconds: 60 }),
        createdAt: unixToIso(now - 3 * DAY_SECONDS),
      },
      {
        id: monitorWebhookId,
        teamId,
        name: 'Payment Webhook',
        url: null,
        method: 'GET',
        timeoutMs: 10000,
        intervalSeconds: 300,
        failureThreshold: 1,
        enabled: 1,
        nextRunAt: now + 200,
        lockedUntil: 0,
        type: 'webhook',
        webhookToken: webhookTokenHash,
        externalConfig: null,
        createdAt: unixToIso(now - 40 * DAY_SECONDS),
      },
      {
        id: monitorManualId,
        teamId,
        name: 'Support Process (Manual)',
        url: null,
        method: 'GET',
        timeoutMs: 15000,
        intervalSeconds: 900,
        failureThreshold: 1,
        enabled: 1,
        nextRunAt: now + 900,
        lockedUntil: 0,
        type: 'manual',
        webhookToken: null,
        externalConfig: null,
        createdAt: unixToIso(now - 20 * DAY_SECONDS),
      },
      {
        id: monitorExternalId,
        teamId,
        name: 'Cloudflare KV Probe',
        url: 'https://api.cloudflare.com/client/v4/user',
        method: 'GET',
        timeoutMs: 7000,
        intervalSeconds: 120,
        failureThreshold: 3,
        enabled: 0,
        nextRunAt: now + 120,
        lockedUntil: 0,
        type: 'external',
        webhookToken: null,
        externalConfig: JSON.stringify({ serviceType: 'cloudflare-kv' }),
        createdAt: unixToIso(now - 10 * DAY_SECONDS),
      },
    ];

    for (const monitor of demoMonitors) {
      try {
        await db.insert(schema.monitors).values(monitor);
      } catch (e) {
        console.error('Error inserting monitor:', e);
      }
    }

    const demoMonitorStates = [
      {
        monitorId: monitorApiId,
        lastCheckedAt: now - 30,
        lastStatus: 'up',
        lastLatencyMs: 142,
        consecutiveFailures: 0,
        lastError: null,
        incidentOpen: 0,
        updatedAt: unixToIso(now - 30),
      },
      {
        monitorId: monitorCheckoutId,
        lastCheckedAt: now - 25,
        lastStatus: 'down',
        lastLatencyMs: 6800,
        consecutiveFailures: 4,
        lastError: '503 Service Unavailable',
        incidentOpen: 1,
        updatedAt: unixToIso(now - 25),
      },
      {
        monitorId: monitorAssertionsId,
        lastCheckedAt: now - 40,
        lastStatus: 'up',
        lastLatencyMs: 180,
        consecutiveFailures: 0,
        lastError: null,
        incidentOpen: 0,
        updatedAt: unixToIso(now - 40),
      },
      {
        monitorId: monitorKeywordId,
        lastCheckedAt: now - 70,
        lastStatus: 'up',
        lastLatencyMs: 210,
        consecutiveFailures: 0,
        lastError: null,
        incidentOpen: 0,
        updatedAt: unixToIso(now - 70),
      },
      {
        monitorId: monitorTlsId,
        lastCheckedAt: now - 200,
        lastStatus: 'up',
        lastLatencyMs: 120,
        consecutiveFailures: 0,
        lastError: null,
        incidentOpen: 0,
        updatedAt: unixToIso(now - 200),
      },
      {
        monitorId: monitorDnsId,
        lastCheckedAt: now - 160,
        lastStatus: 'up',
        lastLatencyMs: 95,
        consecutiveFailures: 0,
        lastError: null,
        incidentOpen: 0,
        updatedAt: unixToIso(now - 160),
      },
      {
        monitorId: monitorTcpId,
        lastCheckedAt: now - 110,
        lastStatus: 'up',
        lastLatencyMs: 60,
        consecutiveFailures: 0,
        lastError: null,
        incidentOpen: 0,
        updatedAt: unixToIso(now - 110),
      },
      {
        monitorId: monitorHeartbeatId,
        lastCheckedAt: now - 240,
        lastStatus: 'up',
        lastLatencyMs: null,
        consecutiveFailures: 0,
        lastError: null,
        incidentOpen: 0,
        updatedAt: unixToIso(now - 240),
      },
      {
        monitorId: monitorWebhookId,
        lastCheckedAt: now - 80,
        lastStatus: 'degraded',
        lastLatencyMs: 2100,
        consecutiveFailures: 1,
        lastError: 'High webhook processing delay',
        incidentOpen: 0,
        updatedAt: unixToIso(now - 80),
      },
      {
        monitorId: monitorManualId,
        lastCheckedAt: now - 600,
        lastStatus: 'unknown',
        lastLatencyMs: null,
        consecutiveFailures: 0,
        lastError: null,
        incidentOpen: 0,
        updatedAt: unixToIso(now - 600),
      },
      {
        monitorId: monitorExternalId,
        lastCheckedAt: now - 140,
        lastStatus: 'up',
        lastLatencyMs: 320,
        consecutiveFailures: 0,
        lastError: null,
        incidentOpen: 0,
        updatedAt: unixToIso(now - 140),
      },
    ];

    for (const state of demoMonitorStates) {
      try {
        await db.insert(schema.monitorState).values(state);
      } catch (e) {
        console.error('Error inserting monitor state:', e);
      }
    }

    const componentApiId = demoId('cmp', key, 'api');
    const componentCheckoutId = demoId('cmp', key, 'checkout');
    const componentPaymentsId = demoId('cmp', key, 'payments');
    const componentAuthId = demoId('cmp', key, 'auth');
    const componentSupportId = demoId('cmp', key, 'support');

    const demoComponents = [
      {
        id: componentApiId,
        teamId,
        name: 'Public API',
        description: 'External API for product and order data',
        currentStatus: 'degraded',
        statusUpdatedAt: now - 90,
        createdAt: unixToIso(now - 120 * DAY_SECONDS),
      },
      {
        id: componentCheckoutId,
        teamId,
        name: 'Checkout',
        description: 'Cart checkout and payment processing',
        currentStatus: 'down',
        statusUpdatedAt: now - 90,
        createdAt: unixToIso(now - 120 * DAY_SECONDS),
      },
      {
        id: componentPaymentsId,
        teamId,
        name: 'Payment Gateway',
        description: '3rd-party payment gateway integration',
        currentStatus: 'degraded',
        statusUpdatedAt: now - 250,
        createdAt: unixToIso(now - 95 * DAY_SECONDS),
      },
      {
        id: componentAuthId,
        teamId,
        name: 'Auth Service',
        description: 'User authentication and token issuance',
        currentStatus: 'operational',
        statusUpdatedAt: now - 3600,
        createdAt: unixToIso(now - 80 * DAY_SECONDS),
      },
      {
        id: componentSupportId,
        teamId,
        name: 'Customer Support',
        description: 'Support ticketing and operations',
        currentStatus: 'maintenance',
        statusUpdatedAt: now - 600,
        createdAt: unixToIso(now - 30 * DAY_SECONDS),
      },
    ];

    for (const component of demoComponents) {
      try {
        await db.insert(schema.components).values(component);
      } catch (e) {
        console.error('Error inserting component:', e);
      }
    }

    const statusPagePublicId = demoId('sp', key, 'public');
    const statusPagePrivateId = demoId('sp', key, 'private');
    const statusPageInternalId = demoId('sp', key, 'internal');

    await db.insert(schema.statusPages).values([
      {
        id: statusPagePublicId,
        teamId,
        slug: `acme-demo-${key}`,
        name: 'Acme Demo Status',
        isPublic: 1,
        accessMode: 'public',
        passwordHash: null,
        logoUrl: null,
        brandColor: '#0f766e',
        customCss: null,
        createdAt: unixToIso(now - 100 * DAY_SECONDS),
      },
      {
        id: statusPagePrivateId,
        teamId,
        slug: `acme-demo-private-${key}`,
        name: 'Acme Demo (Password Protected)',
        isPublic: 1,
        accessMode: 'private',
        passwordHash: await hashPassword('demo-password-123'),
        logoUrl: null,
        brandColor: '#2563eb',
        customCss: null,
        createdAt: unixToIso(now - 60 * DAY_SECONDS),
      },
      {
        id: statusPageInternalId,
        teamId,
        slug: `acme-demo-internal-${key}`,
        name: 'Acme Internal Ops',
        isPublic: 0,
        accessMode: 'internal',
        passwordHash: null,
        logoUrl: null,
        brandColor: '#b45309',
        customCss: '.status-header { letter-spacing: 0.02em; }',
        createdAt: unixToIso(now - 45 * DAY_SECONDS),
      },
    ]);

    await db.insert(schema.statusPageComponents).values([
      {
        statusPageId: statusPagePublicId,
        componentId: componentApiId,
        sortOrder: 1,
      },
      {
        statusPageId: statusPagePublicId,
        componentId: componentCheckoutId,
        sortOrder: 2,
      },
      {
        statusPageId: statusPagePublicId,
        componentId: componentPaymentsId,
        sortOrder: 3,
      },
      {
        statusPageId: statusPagePublicId,
        componentId: componentAuthId,
        sortOrder: 4,
      },
      {
        statusPageId: statusPagePrivateId,
        componentId: componentApiId,
        sortOrder: 1,
      },
      {
        statusPageId: statusPagePrivateId,
        componentId: componentPaymentsId,
        sortOrder: 2,
      },
      {
        statusPageId: statusPagePrivateId,
        componentId: componentAuthId,
        sortOrder: 3,
      },
      {
        statusPageId: statusPageInternalId,
        componentId: componentSupportId,
        sortOrder: 1,
      },
      {
        statusPageId: statusPageInternalId,
        componentId: componentCheckoutId,
        sortOrder: 2,
      },
    ]);

    await db.insert(schema.componentMonitors).values([
      { componentId: componentApiId, monitorId: monitorApiId },
      { componentId: componentCheckoutId, monitorId: monitorCheckoutId },
      { componentId: componentPaymentsId, monitorId: monitorWebhookId },
      { componentId: componentAuthId, monitorId: monitorExternalId },
      { componentId: componentSupportId, monitorId: monitorManualId },
      { componentId: componentPaymentsId, monitorId: monitorCheckoutId },
    ]);

    const channelOpsWebhookId = demoId('chan', key, 'ops_webhook');
    const channelEmailId = demoId('chan', key, 'email');
    const channelPagerId = demoId('chan', key, 'pager');

    await db.insert(schema.notificationChannels).values([
      {
        id: channelOpsWebhookId,
        teamId,
        type: 'webhook',
        configJson: JSON.stringify({
          url: 'https://hooks.slack.com/services/T000/B000/demo',
          label: '#ops-alerts',
        }),
        enabled: 1,
        createdAt: unixToIso(now - 70 * DAY_SECONDS),
      },
      {
        id: channelEmailId,
        teamId,
        type: 'email',
        configJson: JSON.stringify({
          to: 'alerts@acme-demo.local',
          from: 'bitwobbly@notifications.nicholasgriffin.dev',
          subject: '[BitWobbly] Incident detected',
          label: 'Ops Email',
        }),
        enabled: 1,
        createdAt: unixToIso(now - 50 * DAY_SECONDS),
      },
      {
        id: channelPagerId,
        teamId,
        type: 'webhook',
        configJson: JSON.stringify({
          url: 'https://events.pagerduty.com/v2/enqueue/demo',
          label: 'PagerDuty',
        }),
        enabled: 0,
        createdAt: unixToIso(now - 20 * DAY_SECONDS),
      },
    ]);

    const maxProject = await db
      .select({ value: schema.sentryProjects.sentryProjectId })
      .from(schema.sentryProjects)
      .orderBy(desc(schema.sentryProjects.sentryProjectId))
      .limit(1);
    const projectBase = (maxProject[0]?.value ?? 0) + 1;

    const projectStorefrontId = demoId('spr', key, 'storefront');
    const projectCheckoutId = demoId('spr', key, 'checkout');

    await db.insert(schema.sentryProjects).values([
      {
        id: projectStorefrontId,
        teamId,
        sentryProjectId: projectBase,
        name: 'Storefront Web',
        platform: 'javascript-react',
        componentId: componentApiId,
        createdAt: unixToIso(now - 80 * DAY_SECONDS),
      },
      {
        id: projectCheckoutId,
        teamId,
        sentryProjectId: projectBase + 1,
        name: 'Checkout Service',
        platform: 'node-express',
        componentId: componentCheckoutId,
        createdAt: unixToIso(now - 78 * DAY_SECONDS),
      },
    ]);

    await db.insert(schema.sentryKeys).values([
      {
        id: demoId('sk', key, 'storefront_default'),
        projectId: projectStorefrontId,
        publicKey: `${key}storefrontpublickey0001`,
        secretKey: `${key}storefrontsecretkey0001`,
        label: 'Default',
        status: 'active',
        rateLimitPerMinute: 1000,
        createdAt: unixToIso(now - 80 * DAY_SECONDS),
        revokedAt: null,
      },
      {
        id: demoId('sk', key, 'checkout_default'),
        projectId: projectCheckoutId,
        publicKey: `${key}checkoutpublickey000001`,
        secretKey: `${key}checkoutsecretkey000001`,
        label: 'Default',
        status: 'active',
        rateLimitPerMinute: 600,
        createdAt: unixToIso(now - 78 * DAY_SECONDS),
        revokedAt: null,
      },
      {
        id: demoId('sk', key, 'checkout_old'),
        projectId: projectCheckoutId,
        publicKey: `${key}checkoutoldpublickey000`,
        secretKey: `${key}checkoutoldsecretkey000`,
        label: 'Legacy',
        status: 'revoked',
        rateLimitPerMinute: 300,
        createdAt: unixToIso(now - 130 * DAY_SECONDS),
        revokedAt: unixToIso(now - 90 * DAY_SECONDS),
      },
    ]);

    const issueReactId = demoId('iss', key, 'react_render');
    const issueApiTimeoutId = demoId('iss', key, 'api_timeout');
    const issueRedisId = demoId('iss', key, 'redis_pressure');
    const issueIgnoredId = demoId('iss', key, 'deprecated_client');

    await db.insert(schema.sentryIssues).values([
      {
        id: issueReactId,
        projectId: projectStorefrontId,
        fingerprint: 'react.render.timeout.v1',
        title:
          "TypeError: Cannot read properties of undefined (reading 'price')",
        culprit: 'src/routes/checkout.tsx',
        level: 'error',
        status: 'unresolved',
        eventCount: 142,
        userCount: 57,
        firstSeenAt: now - 14 * DAY_SECONDS,
        lastSeenAt: now - 5 * 60,
        resolvedAt: null,
        createdAt: unixToIso(now - 14 * DAY_SECONDS),
      },
      {
        id: issueApiTimeoutId,
        projectId: projectCheckoutId,
        fingerprint: 'checkout.api.timeout.v2',
        title: 'Checkout API timeout when creating payment session',
        culprit: 'src/payment/create-session.ts',
        level: 'warning',
        status: 'unresolved',
        eventCount: 88,
        userCount: 33,
        firstSeenAt: now - 6 * DAY_SECONDS,
        lastSeenAt: now - 110,
        resolvedAt: null,
        createdAt: unixToIso(now - 6 * DAY_SECONDS),
      },
      {
        id: issueRedisId,
        projectId: projectCheckoutId,
        fingerprint: 'redis.connection.pressure.v1',
        title: 'Redis connection pool saturation',
        culprit: 'src/cache/client.ts',
        level: 'error',
        status: 'resolved',
        eventCount: 40,
        userCount: 5,
        firstSeenAt: now - 20 * DAY_SECONDS,
        lastSeenAt: now - 9 * DAY_SECONDS,
        resolvedAt: now - 8 * DAY_SECONDS,
        createdAt: unixToIso(now - 20 * DAY_SECONDS),
      },
      {
        id: issueIgnoredId,
        projectId: projectStorefrontId,
        fingerprint: 'deprecated.client.warning.v1',
        title: 'Deprecated browser API warning',
        culprit: 'src/polyfills/deprecations.ts',
        level: 'info',
        status: 'ignored',
        eventCount: 12,
        userCount: 2,
        firstSeenAt: now - 11 * DAY_SECONDS,
        lastSeenAt: now - 3 * DAY_SECONDS,
        resolvedAt: null,
        createdAt: unixToIso(now - 11 * DAY_SECONDS),
      },
    ]);

    const sentryEvents = [
      {
        id: demoId('evt', key, 'react_1'),
        projectId: projectStorefrontId,
        type: 'error',
        level: 'error',
        message: 'TypeError on checkout render',
        fingerprint: 'react.render.timeout.v1',
        issueId: issueReactId,
        release: 'web@2.14.1',
        environment: 'production',
        receivedAt: now - 300,
        user: { id: 'u-321', email: 'buyer1@example.com' },
        tags: { browser: 'Chrome', region: 'us-east-1', source: 'web' },
      },
      {
        id: demoId('evt', key, 'react_2'),
        projectId: projectStorefrontId,
        type: 'error',
        level: 'error',
        message: 'TypeError on checkout render',
        fingerprint: 'react.render.timeout.v1',
        issueId: issueReactId,
        release: 'web@2.14.1',
        environment: 'production',
        receivedAt: now - 180,
        user: { id: 'u-654', email: 'buyer2@example.com' },
        tags: { browser: 'Safari', region: 'eu-west-1', source: 'web' },
      },
      {
        id: demoId('evt', key, 'api_timeout_1'),
        projectId: projectCheckoutId,
        type: 'error',
        level: 'warning',
        message: 'Payment session API exceeded 8s timeout',
        fingerprint: 'checkout.api.timeout.v2',
        issueId: issueApiTimeoutId,
        release: 'checkout@1.8.3',
        environment: 'production',
        receivedAt: now - 120,
        user: { id: 'svc-checkout' },
        tags: { browser: 'server', region: 'us-west-2', source: 'payments' },
      },
      {
        id: demoId('evt', key, 'api_timeout_2'),
        projectId: projectCheckoutId,
        type: 'error',
        level: 'warning',
        message: 'Payment session API exceeded 8s timeout',
        fingerprint: 'checkout.api.timeout.v2',
        issueId: issueApiTimeoutId,
        release: 'checkout@1.8.2',
        environment: 'staging',
        receivedAt: now - 3600,
        user: { id: 'svc-checkout' },
        tags: { browser: 'server', region: 'us-west-2', source: 'payments' },
      },
      {
        id: demoId('evt', key, 'redis_1'),
        projectId: projectCheckoutId,
        type: 'error',
        level: 'error',
        message: 'Redis pool exhausted',
        fingerprint: 'redis.connection.pressure.v1',
        issueId: issueRedisId,
        release: 'checkout@1.8.0',
        environment: 'production',
        receivedAt: now - 9 * DAY_SECONDS,
        user: { id: 'svc-checkout' },
        tags: { browser: 'server', region: 'us-east-1', source: 'cache' },
      },
      {
        id: demoId('evt', key, 'info_ignored'),
        projectId: projectStorefrontId,
        type: 'default',
        level: 'info',
        message: 'Deprecated API warning observed',
        fingerprint: 'deprecated.client.warning.v1',
        issueId: issueIgnoredId,
        release: 'web@2.13.0',
        environment: 'production',
        receivedAt: now - 2 * DAY_SECONDS,
        user: { id: 'u-111', email: 'buyer3@example.com' },
        tags: { browser: 'Firefox', region: 'ap-southeast-2', source: 'web' },
      },
    ];

    for (const event of sentryEvents) {
      const r2Key = `demo/${teamId}/${event.id}.json`;
      const payload = {
        event_id: event.id,
        message: event.message,
        level: event.level,
        release: event.release,
        environment: event.environment,
        tags: event.tags,
        user: event.user,
      };

      await env.SENTRY_RAW.put(r2Key, JSON.stringify(payload, null, 2), {
        httpMetadata: { contentType: 'application/json' },
      });

      await db.insert(schema.sentryEvents).values({
        id: event.id,
        projectId: event.projectId,
        type: event.type,
        level: event.level,
        message: event.message,
        fingerprint: event.fingerprint,
        issueId: event.issueId,
        release: event.release,
        environment: event.environment,
        r2Key,
        receivedAt: event.receivedAt,
        createdAt: unixToIso(event.receivedAt),
        user: event.user,
        tags: event.tags,
        contexts: {
          runtime: { name: 'node', version: '20' },
          browser: { name: 'Chrome' },
        },
        request: {
          method: 'POST',
          url: 'https://demo-api.bitwobbly.com/checkout',
        },
        exception: {
          values: [{ type: 'Error', value: event.message }],
        },
        breadcrumbs: [
          {
            timestamp: unixToIso(event.receivedAt - 5),
            type: 'default',
            category: 'app.lifecycle',
            message: 'Checkout request started',
            level: 'info',
            data: { project: event.projectId },
          },
        ],
      });
    }

    await db.insert(schema.sentrySessions).values([
      {
        id: demoId('ses', key, 'storefront_1'),
        projectId: projectStorefrontId,
        sessionId: demoId('session', key, 'storefront_1'),
        distinctId: 'buyer-001',
        status: 'ok',
        errors: 0,
        started: now - 400,
        duration: 95,
        release: 'web@2.14.1',
        environment: 'production',
        userAgent: 'Mozilla/5.0',
        receivedAt: now - 305,
        createdAt: unixToIso(now - 305),
      },
      {
        id: demoId('ses', key, 'storefront_2'),
        projectId: projectStorefrontId,
        sessionId: demoId('session', key, 'storefront_2'),
        distinctId: 'buyer-002',
        status: 'errored',
        errors: 1,
        started: now - 320,
        duration: 41,
        release: 'web@2.14.1',
        environment: 'production',
        userAgent: 'Mozilla/5.0',
        receivedAt: now - 180,
        createdAt: unixToIso(now - 180),
      },
      {
        id: demoId('ses', key, 'checkout_1'),
        projectId: projectCheckoutId,
        sessionId: demoId('session', key, 'checkout_1'),
        distinctId: 'svc-01',
        status: 'ok',
        errors: 0,
        started: now - 500,
        duration: 150,
        release: 'checkout@1.8.3',
        environment: 'production',
        userAgent: 'node-fetch/3',
        receivedAt: now - 120,
        createdAt: unixToIso(now - 120),
      },
      {
        id: demoId('ses', key, 'checkout_2'),
        projectId: projectCheckoutId,
        sessionId: demoId('session', key, 'checkout_2'),
        distinctId: 'svc-02',
        status: 'abnormal',
        errors: 2,
        started: now - 3900,
        duration: 12,
        release: 'checkout@1.8.2',
        environment: 'staging',
        userAgent: 'node-fetch/3',
        receivedAt: now - 3600,
        createdAt: unixToIso(now - 3600),
      },
    ]);

    await db.insert(schema.sentryClientReports).values([
      {
        id: demoId('cr', key, 'storefront_1'),
        projectId: projectStorefrontId,
        timestamp: now - 240,
        discardedEvents: [
          { reason: 'network_error', category: 'error', quantity: 4 },
          { reason: 'sample_rate', category: 'transaction', quantity: 12 },
        ],
        receivedAt: now - 230,
        createdAt: unixToIso(now - 230),
      },
      {
        id: demoId('cr', key, 'checkout_1'),
        projectId: projectCheckoutId,
        timestamp: now - 800,
        discardedEvents: [
          { reason: 'queue_overflow', category: 'error', quantity: 3 },
        ],
        receivedAt: now - 790,
        createdAt: unixToIso(now - 790),
      },
    ]);

    const incidentCheckoutId = demoId('inc', key, 'checkout_outage');
    const incidentPaymentsId = demoId('inc', key, 'payments_degraded');
    const incidentResolvedId = demoId('inc', key, 'auth_resolved');

    await db.insert(schema.incidents).values([
      {
        id: incidentCheckoutId,
        teamId,
        statusPageId: statusPagePublicId,
        monitorId: monitorCheckoutId,
        title: 'Checkout is unavailable',
        status: 'investigating',
        startedAt: now - 90 * 60,
        resolvedAt: null,
        createdAt: unixToIso(now - 90 * 60),
      },
      {
        id: incidentPaymentsId,
        teamId,
        statusPageId: statusPagePublicId,
        monitorId: monitorWebhookId,
        title: 'Payment confirmations delayed',
        status: 'monitoring',
        startedAt: now - 12 * 60 * 60,
        resolvedAt: null,
        createdAt: unixToIso(now - 12 * 60 * 60),
      },
      {
        id: incidentResolvedId,
        teamId,
        statusPageId: statusPagePublicId,
        monitorId: monitorApiId,
        title: 'Auth token refresh errors',
        status: 'resolved',
        startedAt: now - 4 * DAY_SECONDS,
        resolvedAt: now - 3 * DAY_SECONDS,
        createdAt: unixToIso(now - 4 * DAY_SECONDS),
      },
    ]);

    await db.insert(schema.incidentUpdates).values([
      {
        id: demoId('upd', key, 'checkout_1'),
        incidentId: incidentCheckoutId,
        message: 'We are investigating elevated failures in checkout.',
        status: 'investigating',
        createdAt: unixToIso(now - 90 * 60),
      },
      {
        id: demoId('upd', key, 'checkout_2'),
        incidentId: incidentCheckoutId,
        message: 'Issue isolated to payment session creation path.',
        status: 'identified',
        createdAt: unixToIso(now - 45 * 60),
      },
      {
        id: demoId('upd', key, 'payments_1'),
        incidentId: incidentPaymentsId,
        message: 'Payment provider latency is elevated in one region.',
        status: 'monitoring',
        createdAt: unixToIso(now - 11 * 60 * 60),
      },
      {
        id: demoId('upd', key, 'resolved_1'),
        incidentId: incidentResolvedId,
        message: 'Fix deployed to token refresh logic.',
        status: 'identified',
        createdAt: unixToIso(now - 3 * DAY_SECONDS - 4 * 60 * 60),
      },
      {
        id: demoId('upd', key, 'resolved_2'),
        incidentId: incidentResolvedId,
        message: 'Service has remained stable. Incident resolved.',
        status: 'resolved',
        createdAt: unixToIso(now - 3 * DAY_SECONDS),
      },
    ]);

    await db.insert(schema.incidentComponents).values([
      {
        incidentId: incidentCheckoutId,
        componentId: componentCheckoutId,
        impactLevel: 'down',
      },
      {
        incidentId: incidentCheckoutId,
        componentId: componentApiId,
        impactLevel: 'degraded',
      },
      {
        incidentId: incidentPaymentsId,
        componentId: componentPaymentsId,
        impactLevel: 'degraded',
      },
      {
        incidentId: incidentPaymentsId,
        componentId: componentSupportId,
        impactLevel: 'maintenance',
      },
      {
        incidentId: incidentResolvedId,
        componentId: componentAuthId,
        impactLevel: 'degraded',
      },
    ]);

    const ruleIssueThresholdId = demoId('rul', key, 'issue_threshold');
    const ruleNewIssueId = demoId('rul', key, 'new_issue');
    const ruleMonitorDownId = demoId('rul', key, 'monitor_down');
    const ruleMonitorRecoveryId = demoId('rul', key, 'monitor_recovery');

    await db.insert(schema.alertRules).values([
      {
        id: ruleIssueThresholdId,
        teamId,
        name: 'Checkout error spike',
        enabled: 1,
        sourceType: 'issue',
        projectId: projectCheckoutId,
        monitorId: null,
        environment: 'production',
        triggerType: 'event_threshold',
        conditionsJson: JSON.stringify({ level: ['error', 'warning'] }),
        thresholdJson: JSON.stringify({
          type: 'static',
          windowSeconds: 900,
          metric: 'count',
          critical: 20,
          warning: 10,
          resolved: 5,
        }),
        channelId: channelOpsWebhookId,
        actionIntervalSeconds: 900,
        lastTriggeredAt: now - 600,
        ownerId: actorId,
        createdAt: unixToIso(now - 30 * DAY_SECONDS),
      },
      {
        id: ruleNewIssueId,
        teamId,
        name: 'Any new storefront issue',
        enabled: 1,
        sourceType: 'issue',
        projectId: projectStorefrontId,
        monitorId: null,
        environment: 'production',
        triggerType: 'new_issue',
        conditionsJson: JSON.stringify({ level: ['error'] }),
        thresholdJson: null,
        channelId: channelEmailId,
        actionIntervalSeconds: 3600,
        lastTriggeredAt: now - 3 * 60 * 60,
        ownerId: demoUserOwnerId,
        createdAt: unixToIso(now - 25 * DAY_SECONDS),
      },
      {
        id: ruleMonitorDownId,
        teamId,
        name: 'Checkout monitor down',
        enabled: 1,
        sourceType: 'monitor',
        projectId: null,
        monitorId: monitorCheckoutId,
        environment: null,
        triggerType: 'monitor_down',
        conditionsJson: null,
        thresholdJson: null,
        channelId: channelOpsWebhookId,
        actionIntervalSeconds: 300,
        lastTriggeredAt: now - 420,
        ownerId: demoUserMemberId,
        createdAt: unixToIso(now - 18 * DAY_SECONDS),
      },
      {
        id: ruleMonitorRecoveryId,
        teamId,
        name: 'Checkout recovered',
        enabled: 0,
        sourceType: 'monitor',
        projectId: null,
        monitorId: monitorCheckoutId,
        environment: null,
        triggerType: 'monitor_recovery',
        conditionsJson: null,
        thresholdJson: null,
        channelId: channelPagerId,
        actionIntervalSeconds: 900,
        lastTriggeredAt: null,
        ownerId: null,
        createdAt: unixToIso(now - 18 * DAY_SECONDS),
      },
    ]);

    await db.insert(schema.alertRuleStates).values([
      {
        id: demoId('ars', key, 'checkout_open'),
        ruleId: ruleIssueThresholdId,
        issueId: issueApiTimeoutId,
        status: 'triggered',
        triggeredAt: now - 1400,
        resolvedAt: null,
      },
      {
        id: demoId('ars', key, 'storefront_resolved'),
        ruleId: ruleNewIssueId,
        issueId: issueIgnoredId,
        status: 'resolved',
        triggeredAt: now - 9 * DAY_SECONDS,
        resolvedAt: now - 8 * DAY_SECONDS,
      },
    ]);

    await db.insert(schema.alertRuleFires).values([
      {
        id: demoId('arf', key, '1'),
        ruleId: ruleIssueThresholdId,
        issueId: issueApiTimeoutId,
        eventId: demoId('evt', key, 'api_timeout_1'),
        severity: 'critical',
        triggerReason: '22 events in 15 minutes exceeded critical threshold',
        firedAt: now - 1200,
      },
      {
        id: demoId('arf', key, '2'),
        ruleId: ruleIssueThresholdId,
        issueId: issueApiTimeoutId,
        eventId: demoId('evt', key, 'api_timeout_2'),
        severity: 'warning',
        triggerReason: '12 events in 15 minutes exceeded warning threshold',
        firedAt: now - 3600,
      },
      {
        id: demoId('arf', key, '3'),
        ruleId: ruleNewIssueId,
        issueId: issueReactId,
        eventId: demoId('evt', key, 'react_1'),
        severity: 'high',
        triggerReason: 'New issue detected in storefront project',
        firedAt: now - 300,
      },
      {
        id: demoId('arf', key, '4'),
        ruleId: ruleMonitorDownId,
        issueId: null,
        eventId: null,
        severity: 'critical',
        triggerReason: 'Monitor status changed to down',
        firedAt: now - 420,
      },
      {
        id: demoId('arf', key, '5'),
        ruleId: ruleMonitorDownId,
        issueId: null,
        eventId: null,
        severity: 'critical',
        triggerReason: 'Monitor remains down beyond threshold',
        firedAt: now - 120,
      },
    ]);

    const teamMembers = await db
      .select({
        userId: schema.userTeams.userId,
        role: schema.userTeams.role,
      })
      .from(schema.userTeams)
      .where(eq(schema.userTeams.teamId, teamId));

    const memberCount = teamMembers.length;
    const ownerCount = teamMembers.filter((m) => m.role === 'owner').length;

    if (ownerCount === 0) {
      await db.insert(schema.userTeams).values({
        userId: actorId,
        teamId,
        role: 'owner',
        joinedAt: createdAt,
      });
    } else {
      await db
        .update(schema.userTeams)
        .set({ role: 'owner' })
        .where(
          and(
            eq(schema.userTeams.teamId, teamId),
            eq(schema.userTeams.userId, actorId),
            ne(schema.userTeams.role, 'owner'),
          ),
        );
    }

    return {
      ok: true,
      counts: {
        monitors: 5,
        components: 5,
        statusPages: 2,
        incidents: 3,
        channels: 3,
        alertRules: 4,
        sentryProjects: 2,
        teamMembers: memberCount + (ownerCount === 0 ? 1 : 0),
      },
    };
  },
);

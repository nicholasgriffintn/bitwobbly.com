export function getPublicStatusSnapshotCacheKey(slug: string) {
  return `status:public:${slug}`;
}

export function getTeamStatusSnapshotCacheKey(teamId: string, slug: string) {
  return `status:team:${teamId}:${slug}`;
}


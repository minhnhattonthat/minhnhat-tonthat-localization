// Pure filter/sort over projects.json items.

export function filterProjects(projects, { q = '', platform = '', status = '' }) {
  const needle = q.trim().toLowerCase();
  return projects.filter(
    (p) =>
      (!platform || p.platform === platform) &&
      (!status || p.status === status) &&
      (!needle || `${p.title} ${p.description}`.toLowerCase().includes(needle)),
  );
}

const desc = (get) => (a, b) => {
  const x = get(a), y = get(b);
  if (x === y) return 0;
  if (x == null) return 1;
  if (y == null) return -1;
  return x < y ? 1 : -1;
};

const SORTS = {
  created: desc((p) => p.createdAt),
  release: desc((p) => (p.release ?? p.testBuild)?.date),
  az: (a, b) => a.title.localeCompare(b.title),
};

export function sortProjects(projects, key) {
  return [...projects].sort(SORTS[key] ?? SORTS.az);
}

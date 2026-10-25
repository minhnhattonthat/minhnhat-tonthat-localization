// Pure filter/sort over projects.json items.

export function filterProjects(projects, { q = '', platform = '' }) {
  const needle = q.trim().toLowerCase();
  return projects.filter(
    (p) =>
      (!platform || p.platform === platform) &&
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
  release: desc((p) => p.release?.date),
  az: (a, b) => a.title.localeCompare(b.title),
  downloads: (a, b) => (b.downloads ?? 0) - (a.downloads ?? 0),
};

export function sortProjects(projects, key) {
  return [...projects].sort(SORTS[key] ?? SORTS.az);
}

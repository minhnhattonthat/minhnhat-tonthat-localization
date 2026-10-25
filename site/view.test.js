import test from 'node:test';
import assert from 'node:assert/strict';
import { filterProjects, sortProjects } from './view.js';

const P = [
  { title: 'Beta', description: 'gba thing', platform: 'GBA', status: 'progress', release: null, testBuild: null, createdAt: '2026-03', updatedAt: '2026-01' },
  { title: 'alpha', description: 'snes', platform: 'SNES', status: 'released', release: { date: '2026-05' }, testBuild: null, createdAt: '2026-01', updatedAt: '2026-02' },
  { title: 'Gamma', description: '', platform: 'SNES', status: 'test', release: null, testBuild: { date: '2026-06' }, createdAt: '2026-02', updatedAt: '2026-03' },
];
const titles = (a) => a.map((p) => p.title);

test('filter', () => {
  assert.deepEqual(titles(filterProjects(P, { platform: 'SNES' })), ['alpha', 'Gamma']);
  assert.deepEqual(titles(filterProjects(P, { status: 'test' })), ['Gamma']);
  assert.deepEqual(titles(filterProjects(P, { q: 'GBA' })), ['Beta']);
  assert.deepEqual(filterProjects(P, { q: 'zzz' }), []);
  assert.equal(filterProjects(P, {}).length, 3);
});

test('sort', () => {
  assert.deepEqual(titles(sortProjects(P, 'updated')), ['Gamma', 'alpha', 'Beta']);
  assert.deepEqual(titles(sortProjects(P, 'created')), ['Beta', 'Gamma', 'alpha']);
  assert.deepEqual(titles(sortProjects(P, 'release')), ['Gamma', 'alpha', 'Beta']);
  assert.deepEqual(titles(sortProjects(P, 'az')), ['alpha', 'Beta', 'Gamma']);
});

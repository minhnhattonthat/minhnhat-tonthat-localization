// Renders projects.json as cards. Repo text is untrusted: build DOM with textContent only.
import { filterProjects, sortProjects } from './view.js';

const $ = (id) => document.getElementById(id);
const STATUS = { released: 'Released', test: 'Test build', progress: 'In progress' };
let projects = [];

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter(Boolean));
  return node;
}

const link = (href, text, className) => el('a', { href, textContent: text, className, target: '_blank', rel: 'noopener' });

const placeholder = (p) => el('div', { className: `cover placeholder cover--${p.platform}`, textContent: p.platform });

function card(p) {
  const cover = p.cover
    ? el('img', { className: 'cover', src: p.cover, alt: `${p.title} cover`, loading: 'lazy',
        onerror() { this.replaceWith(placeholder(p)); } })
    : placeholder(p);

  const shots = p.screenshots.length
    ? el('div', { className: 'shots' }, ...p.screenshots.map((s, i) =>
        el('a', { href: s, target: '_blank', rel: 'noopener' },
          el('img', { src: s, alt: `${p.title} screenshot ${i + 1}`, loading: 'lazy' }))))
    : null;

  return el('article', { className: 'card' },
    cover,
    el('div', { className: 'body' },
      el('h2', { textContent: p.title }),
      el('div', { className: 'meta' },
        el('span', { className: `badge badge--${p.status}`, textContent: STATUS[p.status] }),
        el('span', { textContent: p.platform }),
        el('span', { textContent: `Updated ${new Date(p.updatedAt).toLocaleDateString()}` })),
      shots,
      el('div', { className: 'links' },
        p.release && link(p.release.url, `⬇ Download ${p.release.tag}`),
        p.testBuild && link(p.testBuild.url, `Test build ${p.testBuild.tag}`),
        link(p.issueUrl, '⚠ Report issue', 'report'),
        link(p.repoUrl, 'Repo'))));
}

function render() {
  const list = sortProjects(
    filterProjects(projects, { q: $('q').value, platform: $('platform').value, status: $('status').value }),
    $('sort').value,
  );
  $('grid').replaceChildren(...(list.length ? list.map(card) : [el('p', { className: 'empty', textContent: 'No projects match.' })]));
}

$('q').addEventListener('input', render);
for (const id of ['platform', 'status', 'sort']) $(id).addEventListener('change', render);

try {
  const res = await fetch('projects.json');
  if (!res.ok) throw new Error(res.status);
  projects = await res.json();
  render();
} catch {
  $('grid').replaceChildren(el('p', { className: 'empty', textContent: "Couldn't load projects." }));
}

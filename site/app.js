// Renders projects.json as cards. Repo text is untrusted: build DOM with textContent only.
import { filterProjects, sortProjects } from './view.js';

const $ = (id) => document.getElementById(id);
const STATUS = { released: 'Released', test: 'Test build', progress: 'In progress' };
let projects = [];
let platform = '';

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter(Boolean));
  return node;
}

const link = (href, text, className) => el('a', { href, textContent: text, className, target: '_blank', rel: 'noopener' });
const chip = (kind, text) => el('span', { className: `chip chip--${kind}`, textContent: text });
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
    el('h3', { textContent: p.title }),
    el('div', { className: 'chips' }, chip(p.platform, p.platform)),
    el('span', { className: 'status', textContent: [STATUS[p.status], (p.release ?? p.testBuild)?.tag, `Updated ${new Date(p.updatedAt).toLocaleDateString()}`].filter(Boolean).join(' · ') }),
    shots,
    el('div', { className: 'links' },
      p.release && link(p.release.url, `⬇ ${p.release.tag}`),
      p.testBuild && link(p.testBuild.url, `Test ${p.testBuild.tag}`),
      link(p.issueUrl, 'Report issue', 'report'),
      link(p.repoUrl, 'Repo')));
}

// Featured game: newest release first, covers only (the hero needs art).
function featured() {
  return sortProjects(projects.filter((p) => p.cover && (p.release || p.testBuild)), 'release').slice(0, 6);
}

function showHero(p) {
  const build = p.release ?? p.testBuild;
  const bg = el('div', { className: 'bg' });
  bg.style.backgroundImage = `url("${encodeURI(p.cover)}")`;
  $('hero').replaceChildren(bg,
    el('div', { className: 'inner' },
      el('img', { className: 'art', src: p.cover, alt: `${p.title} cover` }),
      el('div', {},
        el('div', { className: 'chips' }, chip(p.platform, p.platform), chip(p.status, STATUS[p.status])),
        el('h1', { textContent: p.title }),
        el('p', { textContent: `English patch ${build.tag} · ${new Date(build.date).toLocaleDateString()}` }),
        el('div', { className: 'actions' },
          link(build.url, '⬇ Download', 'btn'),
          link(p.repoUrl, 'Project page', 'btn ghost')))));
  for (const b of $('strip').children) b.setAttribute('aria-current', b.dataset.repo === p.repo);
}

function renderFeatured() {
  const list = featured();
  if (!list.length) return $('hero').remove();
  $('strip').replaceChildren(...list.map((p) => {
    const b = el('button', { type: 'button', onclick: () => showHero(p) },
      el('img', { src: p.cover, alt: '', loading: 'lazy' }),
      el('span', { textContent: p.title }));
    b.dataset.repo = p.repo;
    return b;
  }));
  showHero(list[0]);
}

function render() {
  const list = sortProjects(
    filterProjects(projects, { q: $('q').value, platform, status: $('status').value }),
    $('sort').value,
  );
  $('grid').replaceChildren(...(list.length ? list.map(card) : [el('p', { className: 'empty', textContent: 'No projects match.' })]));
}

$('platform').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  platform = b.value;
  for (const x of $('platform').children) x.setAttribute('aria-pressed', x === b);
  render();
});
$('q').addEventListener('input', render);
for (const id of ['status', 'sort']) $(id).addEventListener('change', render);

try {
  const res = await fetch('projects.json');
  if (!res.ok) throw new Error(res.status);
  projects = await res.json();
  renderFeatured();
  render();
} catch {
  $('grid').replaceChildren(el('p', { className: 'empty', textContent: "Couldn't load projects." }));
}

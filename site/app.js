// Renders projects.json as cards. Repo text is untrusted: build DOM with textContent only.
import { filterProjects, sortProjects } from './view.js';

const $ = (id) => document.getElementById(id);
let projects = [];
let platform = '';

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter(Boolean));
  return node;
}

const link = (href, text, className) => el('a', { href, textContent: text, className, target: '_blank', rel: 'noopener' });
const chip = (kind, text) => el('span', { className: `chip chip--${kind}`, textContent: text });
// Japanese store style (DLsite): small label, full value; dates as 2026/10/23.
const jaDate = (d) => new Date(d).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
const meta = (label, value) => el('div', { className: 'meta' }, el('span', { className: 'label', textContent: label }), value);
const placeholder = (p) => el('div', { className: `cover placeholder cover--${p.platform}`, textContent: p.platform });

function card(p) {
  const build = p.release;
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
    build && meta('Release', jaDate(build.date)),
    meta('Downloads', p.downloads.toLocaleString('ja-JP')),
    shots,
    el('div', { className: 'links' },
      p.release && link(p.release.url, `⬇ ${p.release.tag}`),
      Object.assign(link(p.issueUrl, '⚠︎', 'report'), { ariaLabel: 'Report issue' })));
}

// Featured game: newest release first, covers only (the hero needs art).
function featured() {
  return sortProjects(projects.filter((p) => p.cover && p.release), 'release').slice(0, 6);
}

function showHero(p) {
  const build = p.release;
  const bg = el('div', { className: 'bg' });
  bg.style.backgroundImage = `url("${encodeURI(p.cover)}")`;
  $('hero').replaceChildren(bg,
    el('div', { className: 'inner' },
      el('img', { className: 'art', src: p.cover, alt: `${p.title} cover` }),
      el('div', {},
        el('div', { className: 'chips' }, chip(p.platform, p.platform)),
        el('h1', { textContent: p.title }),
        el('p', { textContent: `English patch ${build.tag} · ${jaDate(build.date)}` }),
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
    filterProjects(projects, { q: $('q').value, platform }),
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
$('sort').addEventListener('change', render);

try {
  const res = await fetch('projects.json');
  if (!res.ok) throw new Error(res.status);
  projects = await res.json();
  renderFeatured();
  render();
} catch {
  $('grid').replaceChildren(el('p', { className: 'empty', textContent: "Couldn't load projects." }));
}

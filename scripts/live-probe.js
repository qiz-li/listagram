// Read-only check of Instagram's page structure on the live site.
//
// Run it in a browser tab emulating an iPhone, once on each of:
//   https://www.instagram.com/
//   https://www.instagram.com/?variant=following
// Run it on a clean page, without Listagram active.
//
// It only reads the page and scrolls. It does not click, open anything or call
// any API, and its output contains counts and address shapes but no usernames,
// post IDs or message text.
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const all = (s) => [...document.querySelectorAll(s)];
  const hrefs = () => all('a[href]').map((a) => a.getAttribute('href'));
  const shape = (h) => h
    .replace(/\/(p|reel|reels)\/[^/?]+/, '/$1/ID')
    .replace(/^\/[^/]+\/(p|reel|reels|tagged)/, '/USER/$1')
    .replace(/\/\d+\/$/, '/NUM/');
  const isHome = location.pathname === '/' && !/variant=following/.test(location.search);
  const isFollowing = location.pathname === '/' && /variant=following/.test(location.search);

  const items = new Map();
  const reelShapes = new Set();
  const sample = () => all('main article').forEach((a, i) => {
    const link = a.querySelector('a[href*="/p/"],a[href*="/reel/"],a[href*="/reels/"]');
    const text = a.textContent || '';
    items.set(link ? link.getAttribute('href') : 'item' + i, {
      video: !!a.querySelector('video'),
      reel: !!a.querySelector('a[href*="/reel/"],a[href*="/reels/"]'),
      suggested: /suggest/i.test(text),
      sponsored: /sponsored/i.test(text)
    });
    a.querySelectorAll('a[href*="/reel/"],a[href*="/reels/"]').forEach((l) => reelShapes.add(shape(l.getAttribute('href'))));
  });
  let looseVideos = 0;
  sample();
  for (let i = 0; i < 8; i++) {
    window.scrollBy(0, innerHeight * 1.2);
    await wait(1200);
    sample();
    looseVideos += all('main video').filter((v) => !v.closest('article')).length;
  }
  window.scrollTo(0, 0);
  await wait(500);

  const list = [...items.values()];
  const h = hrefs();
  const stories = all('main [aria-label*="tory" i]');
  const checks = [
    ['script not active on this page (results are only valid if it is not)', !window.__listagram],
    ['main element exists', !!document.querySelector('main')],
    ['Reels nav link is /reels/', h.includes('/reels/')],
    ['Explore nav link starts with /explore', h.some((x) => x.startsWith('/explore'))],
    ['inbox link starts with /direct/inbox', h.some((x) => x.startsWith('/direct/inbox'))],
    ['feed items are in main article', list.length > 0],
    ['every feed video is inside an article', looseVideos === 0]
  ];
  if (isHome) {
    checks.push(['stories row exists', stories.length > 0]);
    checks.push(['stories row is outside feed items', stories.length > 0 && stories.every((s) => !s.closest('article'))]);
  }
  if (isFollowing) {
    checks.push(['following feed has no suggested items', list.every((x) => !x.suggested)]);
    checks.push(['following feed has no sponsored items', list.every((x) => !x.sponsored)]);
    checks.push(['reel links carry an ID', [...reelShapes].length === 0 || [...reelShapes].every((x) => /\/ID\//.test(x))]);
  }
  return JSON.stringify({
    page: isHome ? 'home' : isFollowing ? 'following' : 'other (run on home and following)',
    width: innerWidth,
    failed: checks.filter((c) => !c[1]).map((c) => c[0]),
    passed: checks.filter((c) => c[1]).length,
    total: checks.length,
    feedItems: list.length,
    withVideo: list.filter((x) => x.video).length,
    withReelLink: list.filter((x) => x.reel).length,
    suggested: list.filter((x) => x.suggested).length,
    sponsored: list.filter((x) => x.sponsored).length,
    reelLinkShapes: [...reelShapes],
    storyButtons: stories.length
  }, null, 1);
})();

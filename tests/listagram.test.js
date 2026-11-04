// Behavior tests against a mock page. They check Listagram's rules, not whether
// Instagram still matches those rules: use scripts/live-probe.js for that.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const source = fs.readFileSync(path.join(__dirname, '../src/listagram.user.js'), 'utf8');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const PAGE = `<html><head></head><body>
<nav><a id="inbox" href="/direct/inbox/">i</a><a id="reelsNav" href="/reels/">r</a><a id="explore" href="/explore/">e</a></nav>
<main><div id="tray">stories</div>
<article id="feedReel"><a id="reel1" href="/reels/AAA/123/"><video></video></a></article>
<a id="reel2" href="/someone/reel/BBB/">grid reel</a>
</main></body></html>`;

function load(url = 'https://www.instagram.com/', html = PAGE, pass) {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  const w = dom.window, d = w.document;
  let pauses = 0;
  w.HTMLMediaElement.prototype.pause = function () { pauses++; };
  d.addEventListener('click', (e) => e.preventDefault());
  if (pass) w.sessionStorage.setItem('listagramPass', pass);
  w.eval(source);
  const block = d.querySelector('[data-listagram="block"]');
  const friends = d.querySelector('[data-listagram="friends"]');
  return {
    w, d, block, friends,
    blocked: () => block.style.display === 'flex',
    hidden: (id) => w.getComputedStyle(d.getElementById(id)).display === 'none',
    go: async (p) => { w.history.pushState({}, '', p); await wait(320); },
    pausesDuring: async () => { pauses = 0; await wait(320); return pauses; },
    close: () => w.close()
  };
}

test('runs only once if injected twice', () => {
  const t = load();
  t.w.eval(source);
  assert.equal(t.d.querySelectorAll('[data-listagram="block"]').length, 1);
  t.close();
});

test('home hides the feed, keeps stories, shows the friends button', async () => {
  const t = load();
  await wait(320);
  assert.ok(t.d.documentElement.classList.contains('listagram-home'));
  assert.equal(t.friends.style.display, 'block');
  assert.equal(t.friends.getAttribute('href'), '/?variant=following');
  assert.ok(!t.hidden('tray'));
  assert.ok(!t.blocked());
  assert.ok(await t.pausesDuring() > 0, 'hidden feed videos should be paused');
  t.close();
});

test('Reels and Explore nav links are hidden, inbox and friend reels are not', () => {
  const t = load();
  assert.ok(t.hidden('reelsNav'));
  assert.ok(t.hidden('explore'));
  assert.ok(!t.hidden('inbox'));
  assert.ok(!t.hidden('reel1'));
  t.close();
});

test('friends feed shows posts and lets videos play', async () => {
  const t = load();
  await t.go('/?variant=following');
  assert.ok(!t.d.documentElement.classList.contains('listagram-home'));
  assert.equal(t.friends.style.display, 'none');
  assert.ok(!t.blocked());
  assert.equal(await t.pausesDuring(), 0);
  t.close();
});

test('the Reels feed and reels without a pass are blocked', async () => {
  const t = load();
  for (const p of ['/reels/', '/reels/AAA/', '/reel/AAA/', '/someone/reel/AAA/']) {
    await t.go(p);
    assert.ok(t.blocked(), p);
  }
  t.close();
});

test('tapping a reel allows that reel, and swiping to another is blocked', async () => {
  const t = load();
  await t.go('/?variant=following');
  t.d.getElementById('reel1').click();
  await t.go('/reels/AAA/123/');
  assert.ok(!t.blocked(), 'tapped reel');
  assert.equal(await t.pausesDuring(), 0, 'tapped reel can play');
  await t.go('/reels/AAA/');
  assert.ok(!t.blocked(), 'same reel, other address form');
  await t.go('/reels/CCC/');
  assert.ok(t.blocked(), 'next reel');
  assert.ok(await t.pausesDuring() > 0, 'next reel is paused');
  t.close();
});

test('clicks inside the reel viewer never grant a pass', async () => {
  const t = load();
  await t.go('/?variant=following');
  t.d.getElementById('reel1').click();
  await t.go('/reels/AAA/');
  t.d.getElementById('reel2').click();
  await t.go('/someone/reel/BBB/');
  assert.ok(t.blocked());
  t.close();
});

test('a new tap replaces the old pass', async () => {
  const t = load();
  await t.go('/?variant=following');
  t.d.getElementById('reel1').click();
  await t.go('/?variant=following');
  t.d.getElementById('reel2').click();
  await t.go('/someone/reel/BBB/');
  assert.ok(!t.blocked(), 'new reel');
  await t.go('/reels/AAA/');
  assert.ok(t.blocked(), 'old reel');
  t.close();
});

test('a pass survives a reload in the same tab', async () => {
  const t = load();
  await t.go('/?variant=following');
  t.d.getElementById('reel1').click();
  const saved = t.w.sessionStorage.getItem('listagramPass');
  t.close();
  assert.equal(saved, 'AAA');
  const r = load('https://www.instagram.com/reels/AAA/', PAGE, saved);
  assert.ok(!r.blocked(), 'the same reel after a reload');
  r.close();
});

test('profiles, posts, DMs, stories and settings are allowed', async () => {
  const t = load();
  for (const p of ['/someone/', '/some.one_1/', '/someone/tagged/', '/someone/reels/', '/p/abc/', '/someone/p/abc/', '/direct/inbox/', '/direct/t/123/', '/stories/friend/1/', '/accounts/edit/']) {
    await t.go(p);
    assert.ok(!t.blocked(), p);
  }
  t.close();
});

test('Explore and unknown deep pages are blocked', async () => {
  const t = load();
  for (const p of ['/explore/', '/explore/search/', '/a/b/c/']) {
    await t.go(p);
    assert.ok(t.blocked(), p);
  }
  t.close();
});

test('the block screen offers both ways out', () => {
  const t = load();
  const hrefs = [...t.block.querySelectorAll('a')].map((a) => a.getAttribute('href'));
  assert.deepEqual(hrefs, ['/?variant=following', '/direct/inbox/']);
  t.close();
});

test('Suggested for you is removed from profiles without touching the profile', async () => {
  const t = load();
  await t.go('/someone/');
  t.d.querySelector('main').insertAdjacentHTML('beforeend',
    '<div id="wrap"><header id="head">profile</header><div id="section"><div><div><span>Suggested for you</span></div><a href="#">See all</a></div><div><button>Follow</button></div></div></div>');
  await wait(320);
  assert.ok(t.hidden('section'));
  assert.ok(!t.hidden('head'));
  assert.ok(!t.hidden('wrap'));
  t.close();
});

test('a snap-scrolling reel viewer in a chat is locked on the reel it opened with', async () => {
  const t = load('https://www.instagram.com/direct/t/1/');
  const m = t.d.querySelector('main');
  m.insertAdjacentHTML('beforeend', '<div id="viewer" style="scroll-snap-type:y mandatory;overflow-y:auto"><div><video id="first"></video></div><div><video id="next"></video></div></div>');
  const viewer = t.d.getElementById('viewer');
  Object.defineProperty(viewer, 'scrollHeight', { value: 1500 });
  Object.defineProperty(viewer, 'clientHeight', { value: 750 });
  await wait(320);
  assert.equal(viewer.getAttribute('data-listagram-locked'), '0');
  assert.equal(viewer.style.getPropertyValue('overflow'), 'hidden');
  viewer.scrollTop = 750;
  await wait(320);
  assert.equal(viewer.scrollTop, 0, 'pulled back to the opened reel');
  assert.ok(!t.blocked(), 'the chat itself stays open');
  t.close();
});

test('a non-snapping chat or feed is not locked', async () => {
  const t = load('https://www.instagram.com/direct/t/1/');
  t.d.querySelector('main').insertAdjacentHTML('beforeend', '<div id="list" style="overflow-y:auto"><video></video></div>');
  const list = t.d.getElementById('list');
  Object.defineProperty(list, 'scrollHeight', { value: 1500 });
  Object.defineProperty(list, 'clientHeight', { value: 750 });
  await wait(320);
  assert.equal(list.getAttribute('data-listagram-locked'), null);
  t.close();
});

test('home hides everything except the stories row', async () => {
  const html = `<html><head></head><body><main><div id="outer"><div id="rowWrap"><div id="row"><div aria-label="Story by a" role="button">a</div><div aria-label="Story by b" role="button">b</div></div></div><div id="rest"><span id="sugg">Suggestions for you</span><article><video></video></article></div></div></main></body></html>`;
  const t = load('https://www.instagram.com/', html);
  await wait(320);
  const v = (id) => t.d.getElementById(id).hasAttribute('data-listagram-hide');
  assert.ok(v('rest'), 'everything beside the stories row is hidden');
  assert.ok(!v('rowWrap') && !v('row') && !v('outer'), 'path to the stories row is kept');
  assert.equal(t.d.querySelectorAll('[aria-label^="Story"][data-listagram-hide]').length, 0, 'no story is hidden');
  t.close();
});

test('the Suggestions for you wording is also removed from profiles', async () => {
  const t = load();
  await t.go('/someone/');
  t.d.querySelector('main').insertAdjacentHTML('beforeend', '<div id="wrap"><header>p</header><div id="section"><span>Suggestions for you</span></div></div>');
  await wait(320);
  assert.ok(t.hidden('section'));
  t.close();
});

const ACTIVITY = `<html><head></head><body><nav><a id="heart" href="/notifications/">h</a></nav><main><div id="list">
<a id="requests" href="/notifications/?followRequests=true">Follow requests</a>
<div id="earlier"><span>Earlier</span><button id="confirm">Confirm</button></div>
<div id="label"><h4>Suggested for you</h4></div>
<div id="people"><button>Follow</button></div>
</div></main></body></html>`;

test('activity and follow requests open, and the heart stays visible', async () => {
  const t = load('https://www.instagram.com/notifications/', ACTIVITY);
  assert.ok(!t.blocked(), 'activity');
  assert.ok(!t.hidden('heart'));
  await t.go('/notifications/?followRequests=true');
  assert.ok(!t.blocked(), 'follow requests');
  t.close();
});

test('the activity page loses only the suggested accounts', async () => {
  const t = load('https://www.instagram.com/notifications/', ACTIVITY);
  await wait(320);
  assert.ok(t.hidden('label') && t.hidden('people'), 'suggestions are hidden');
  assert.ok(!t.hidden('requests') && !t.hidden('earlier') && !t.hidden('confirm') && !t.hidden('list'), 'activity is kept');
  t.close();
});

test('a suggestions heading alone in the page never hides the whole page', async () => {
  const html = '<html><head></head><body><main><div id="only"><h4>Suggested for you</h4></div></main></body></html>';
  const t = load('https://www.instagram.com/notifications/', html);
  await wait(320);
  assert.ok(!t.hidden('only'));
  t.close();
});

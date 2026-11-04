// ==UserScript==
// @name         Listagram
// @description  Keeps DMs, stories, friends' posts and reels. Blocks the Reels feed, Explore, recommendations and swiping between reels.
// @version      1.0.0
// @match        https://www.instagram.com/*
// @run-at       document-end
// @inject-into  content
// @noframes
// @grant        none
// ==/UserScript==

(function () {
  if (window.__listagram) return;
  window.__listagram = 1;

  // ---------------------------------------------------------------------------
  // INSTAGRAM-SPECIFIC VALUES: everything that depends on how Instagram builds its site.
  // When Instagram changes, the fix should almost always be here.
  // ---------------------------------------------------------------------------
  var IG = {
    alwaysAllowed: /^\/($|direct\/|stories\/|accounts\/|challenge\/|auth_platform\/|notifications(\/|$))/,
    notProfiles: /^\/(reels|reel|explore|p|tv|direct|stories|accounts|about|legal|developer|nametag|lite|web|api|graphql)\/?$/i,
    profile: /^\/[a-z0-9._]+\/(tagged\/|reels\/)?$/i,
    post: /^\/([a-z0-9._]+\/)?p\/[^/]+/i,
    reel: /^\/(?:[a-z0-9._]+\/)?reels?\/([^/]+)/i,
    followingUrl: '/?variant=following',
    followingQuery: /[?&]variant=following\b/,
    inboxUrl: '/direct/inbox/',
    inboxLink: 'a[href^="/direct/inbox"]',
    hiddenLinks: 'a[href="/reels/"],a[href^="/explore"]',
    feedItems: 'main article',
    storyRow: 'main [aria-label*="tory" i]',
    feedVideos: 'main article video',
    suggestedText: 'main span',
    suggestedLabel: /^suggest(ed|ions) for you$/i,
    suggestedBoundary: 'header',
    activityPage: /^\/notifications\/?$/,
    activitySuggestedText: 'main h4',
    contentRootTag: 'MAIN',
    swipeAxis: 'y',
    swipeMaxDepth: 14,
    colors: {
      background: 'rgb(var(--ig-primary-background,255,255,255))',
      text: 'rgb(var(--ig-primary-text,0,0,0))',
      muted: 'rgb(var(--ig-secondary-text,115,115,115))',
      button: 'rgb(var(--ig-secondary-button-background,239,239,239))'
    }
  };
  // ---------------------------------------------------------------------------

  var PASS_KEY = 'listagramPass';
  var LOCK = 'data-listagram-locked';
  var CHECK_MS = 250;
  var root = document.documentElement;

  // One-reel pass: tapping a reel link allows that reel only. Swiping changes the
  // reel ID in the address, which no longer matches, so the block screen appears.
  var pass = null;
  try { pass = sessionStorage.getItem(PASS_KEY); } catch (e) {}
  function grant(id) {
    pass = id;
    try { sessionStorage.setItem(PASS_KEY, id); } catch (e) {}
  }
  document.addEventListener('click', function (e) {
    var link = e.target.closest && e.target.closest('a[href]');
    if (!link || IG.reel.test(location.pathname)) return;
    var m = link.getAttribute('href').match(IG.reel);
    if (m) grant(m[1]);
  }, true);

  // Keep hidden home items at full height and stop scrolling. Do not use
  // display:none or a 1px height on home, or the feed keeps loading.
  var style = document.createElement('style');
  style.textContent =
    IG.hiddenLinks + '{display:none!important}' +
    'html.listagram-home ' + IG.feedItems + '{visibility:hidden!important}' +
    'html.listagram-home [data-listagram-hide]{visibility:hidden!important}' +
    'html.listagram-home,html.listagram-home body{overflow:hidden!important}' +
    // Listagram's own screens use Instagram's colors and iPhone's system font.
    '[data-listagram]{font-family:-apple-system,system-ui,sans-serif;-webkit-tap-highlight-color:transparent}' +
    '[data-listagram="block"]{position:fixed;inset:0;z-index:2147483647;flex-direction:column;align-items:center;justify-content:center;padding:24px;background:' + IG.colors.background + ';color:' + IG.colors.text + ';text-align:center}' +
    '[data-listagram="block"] b{font-size:20px;font-weight:600;line-height:26px}' +
    '[data-listagram="block"] p{margin:8px 0 32px;color:' + IG.colors.muted + ';font-size:15px;line-height:20px}' +
    '[data-listagram="block"] a{width:100%;max-width:280px;margin-top:8px}' +
    '[data-listagram="block"] a,[data-listagram="friends"]{box-sizing:border-box;padding:12px 20px;border-radius:12px;background:' + IG.colors.button + ';color:' + IG.colors.text + ';font-size:15px;font-weight:600;line-height:20px;text-decoration:none}' +
    '[data-listagram="block"] a:active,[data-listagram="friends"]:active{opacity:.6}' +
    '[data-listagram="friends"]{position:fixed;left:50%;bottom:calc(136px + env(safe-area-inset-bottom));z-index:2147483646;transform:translateX(-50%);white-space:nowrap}';
  document.head.appendChild(style);

  var block = document.createElement('div');
  block.setAttribute('data-listagram', 'block');
  block.innerHTML = '<b>This page is off</b><p>Listagram hides this.</p>';
  function exit(text, href) {
    var a = document.createElement('a');
    a.href = href;
    a.textContent = text;
    block.appendChild(a);
    return a;
  }
  exit("Back to friends' posts", IG.followingUrl);
  exit('Back to messages', IG.inboxUrl).onclick = function (e) {
    var inbox = document.querySelector(IG.inboxLink);
    if (inbox && !block.contains(inbox)) { e.preventDefault(); inbox.click(); }
  };
  root.appendChild(block);

  var friends = document.createElement('a');
  friends.setAttribute('data-listagram', 'friends');
  friends.href = IG.followingUrl;
  friends.textContent = "Friends' posts";
  root.appendChild(friends);

  function pause(selector) {
    document.querySelectorAll(selector).forEach(function (v) { v.pause(); });
  }

  function hideSuggested() {
    document.querySelectorAll(IG.suggestedText).forEach(function (e) {
      if (e.children.length || !IG.suggestedLabel.test(e.textContent.trim())) return;
      var n = e;
      while (n.parentElement && n.parentElement.tagName !== IG.contentRootTag && !n.parentElement.querySelector(IG.suggestedBoundary)) n = n.parentElement;
      n.style.setProperty('display', 'none', 'important');
    });
  }

  // The activity page ends with a suggested accounts list. Hide its heading and
  // whatever follows, and never anything above, as follow requests live up there.
  function hideActivitySuggested() {
    document.querySelectorAll(IG.activitySuggestedText).forEach(function (e) {
      if (!IG.suggestedLabel.test(e.textContent.trim())) return;
      var n = e;
      while (n.parentElement && n.parentElement.tagName !== IG.contentRootTag && n.parentElement.children.length === 1) n = n.parentElement;
      if (n.parentElement && n.parentElement.tagName === IG.contentRootTag) return;
      for (; n; n = n.nextElementSibling) n.style.setProperty('display', 'none', 'important');
    });
  }

  // Home shows only the stories row, so nothing new can appear there. Start from
  // the element holding every story (its children are the stories themselves),
  // then hide whatever sits beside it on the way up to the content root.
  function hideAllButStories() {
    var stories = document.querySelectorAll(IG.storyRow);
    if (!stories.length) return;
    var n = stories[0], last = stories[stories.length - 1];
    while (n.parentElement && !n.contains(last)) n = n.parentElement;
    for (; n.parentElement && n.tagName !== IG.contentRootTag; n = n.parentElement) {
      for (var s = n.parentElement.firstElementChild; s; s = s.nextElementSibling) {
        if (s !== n && s.tagName !== 'STYLE' && s.tagName !== 'SCRIPT') s.setAttribute('data-listagram-hide', '');
      }
    }
  }

  // Phone layout: reels opened from a chat scroll into Suggested reels while the
  // address stays on the chat, so the pass can't catch them. Lock the viewer
  // itself on the reel it opened with.
  function lockSwipes() {
    document.querySelectorAll('video').forEach(function (v) {
      if (v.closest('[' + LOCK + ']')) return;
      var n = v.parentElement;
      for (var i = 0; n && n !== root && i < IG.swipeMaxDepth; i++, n = n.parentElement) {
        if (getComputedStyle(n).scrollSnapType.indexOf(IG.swipeAxis) === -1 || n.scrollHeight <= n.clientHeight) continue;
        n.setAttribute(LOCK, Math.round(n.scrollTop));
        n.style.setProperty('overflow', 'hidden', 'important');
        n.style.setProperty('touch-action', 'none', 'important');
        return;
      }
    });
    document.querySelectorAll('[' + LOCK + ']').forEach(function (n) {
      var top = +n.getAttribute(LOCK);
      if (Math.abs(n.scrollTop - top) > 1) n.scrollTop = top;
      n.querySelectorAll('video').forEach(function (v) {
        var b = v.getBoundingClientRect();
        var mid = (b.top + b.bottom) / 2;
        if (mid < 0 || mid > innerHeight) v.pause();
      });
    });
  }

  function tick() {
    var p = location.pathname, m = p.match(IG.reel);
    var allowed = IG.alwaysAllowed.test(p);
    var view = !allowed && ((IG.profile.test(p) && !IG.notProfiles.test(p)) || IG.post.test(p));
    var passedReel = !!m && m[1] === pass;
    var blocked = !allowed && !view && !passedReel;
    var home = p === '/' && !IG.followingQuery.test(location.search);
    block.style.display = blocked ? 'flex' : 'none';
    friends.style.display = home ? 'block' : 'none';
    root.classList.toggle('listagram-home', home);
    if (blocked) pause('video');
    if (view) hideSuggested();
    if (IG.activityPage.test(p)) hideActivitySuggested();
    lockSwipes();
    if (home) { pause(IG.feedVideos); hideAllButStories(); }
  }

  tick();
  setInterval(tick, CHECK_MS);
})();

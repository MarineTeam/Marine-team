/* ============================================================
   Grace Community Church — app (vanilla JS SPA, hash router)
   Data comes from window.API (Supabase live, or local mock).
   ============================================================ */
(function () {
  const C = window.CONFIG, API = window.API, Auth = window.Auth;
  const view = document.getElementById('view');
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* ---------- helpers ---------- */
  const money = n => '$' + Number(n).toLocaleString('en-US');
  const grad = (h, s = 60) => `linear-gradient(135deg,hsl(${h} ${s}% 52%),hsl(${(h + 40) % 360} ${s}% 42%))`;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
  const fmtDate = iso => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const dayParts = iso => { const d = new Date(iso + 'T12:00:00'); return { day: d.getDate(), mon: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase() }; };
  const fmtDateTime = ts => { const d = new Date(ts); return isNaN(d) ? String(ts) : d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }); };

  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('is-show');
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('is-show'), 3400);
  }
  const spinner = (label = 'Loading…') => `<div class="loading"><span class="spin"></span>${label}</div>`;

  const icon = {
    play: '<div class="play-ic"></div>',
    search: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    clock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    pin: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>'
  };

  /* ============================================================
     HOME
     ============================================================ */
  function home() {
    const ch = C.church;
    return `
    <section class="hero hero--church">
      <div class="container hero__inner">
        <div class="reveal">
          <span class="hero__badge">👋 New here? <b>You're welcome at Grace</b></span>
          <h1 class="h-xxl">${esc(ch.tagline)}</h1>
          <p class="lead">We're a family of people from all walks of life, learning to follow Jesus together. Join us this Sunday — in person or online.</p>
          <div class="hero__cta">
            <a href="#/visit" class="btn btn--primary btn--lg">Plan your visit</a>
            <a href="#/watch" class="btn btn--ghost btn--lg">▶ Watch online</a>
          </div>
        </div>
        <div class="times-card reveal">
          <h3>Gather with us</h3>
          <div id="homeTimes">${ch.times.map(t => `
            <div class="times-row">
              <div><b>${esc(t.day)}</b><span>${esc(t.service)}</span></div>
              <div class="times-when">${esc(t.time)}</div>
            </div>`).join('')}</div>
          <div class="times-loc">${icon.pin} ${esc(ch.address)}</div>
          <a href="#/visit" class="btn btn--white btn--block" style="margin-top:16px">Get directions &amp; what to expect</a>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="sec-head"><div><span class="eyebrow">Latest message</span><h2 class="h-xl">Catch up on Sunday</h2></div>
          <a href="#/watch" class="btn btn--ghost">All messages →</a></div>
        <div id="homeLatest">${spinner('Loading the latest message…')}</div>
      </div>
    </section>

    <section class="section section--soft">
      <div class="container">
        <div class="sec-head"><div><span class="eyebrow">This month</span><h2 class="h-xl">Upcoming events</h2></div>
          <a href="#/events" class="btn btn--ghost">See all →</a></div>
        <div class="events" id="homeEvents">${spinner('Loading events…')}</div>
      </div>
    </section>

    <section class="section">
      <div class="container center">
        <span class="eyebrow">Next steps</span>
        <h2 class="h-xl">Find your place</h2>
        <p class="lead">Whatever your next step is, we'd love to take it with you.</p>
        <div class="steps">
          ${step('#/visit', 140, '🧭', "I'm New", 'Plan a visit and know what to expect on Sunday.')}
          ${step('#/groups', 268, '🤝', 'Join a Group', 'Life is better together. Find your community.')}
          ${step('#/events', 28, '🙌', 'Serve', 'Use your gifts to make a difference.')}
          ${step('#/give', 168, '💛', 'Give', 'Fuel the mission with a secure online gift.')}
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="cta reveal">
          <h2>However you found us, we're glad you're here.</h2>
          <p>Take your next step this week — plan a visit, watch a message, or connect with a group.</p>
          <div class="cta__row">
            <a href="#/visit" class="btn btn--white btn--lg">Plan your visit</a>
            <a href="#/prayer" class="btn btn--outline-w btn--lg">Request prayer</a>
          </div>
        </div>
      </div>
    </section>`;
  }

  const step = (href, hue, emoji, title, body) => `
    <a class="step reveal" href="${href}">
      <div class="step__ic" style="background:${grad(hue)}">${emoji}</div>
      <h3>${title}</h3><p>${body}</p><span class="step__go">Learn more →</span>
    </a>`;

  const isPublic = s => s.published !== false; // drafts hidden from the public site
  async function fillHome() {
    try {
      const [allSermons, events] = await Promise.all([API.getSermons(), API.getEvents()]);
      mediaState.sermons = allSermons.filter(isPublic);
      const feat = mediaState.sermons.find(s => s.featured) || mediaState.sermons.find(s => s.video_id) || mediaState.sermons[0];
      const l = $('#homeLatest');
      if (l && feat) l.innerHTML = featureSermon(feat);
      const e = $('#homeEvents');
      if (e) e.innerHTML = events.slice(0, 3).map(eventCard).join('');
    } catch (err) { console.error(err); toast('Could not load content.'); }
  }

  /* ============================================================
     WATCH (sermon library)
     ============================================================ */
  let mediaState = { q: '', cat: 'All', sermons: [] };

  function watch() {
    return `
    <section class="phead">
      <div class="container"><span class="eyebrow">Messages</span>
        <h1 class="h-xl">Watch &amp; grow</h1>
        <p class="lead">Missed a Sunday or want to revisit a series? Watch anytime, on any device.</p></div>
    </section>
    <section class="section" style="padding-top:40px"><div class="container" id="watchBody">${spinner('Loading messages…')}</div></section>`;
  }

  async function fillWatch() {
    try {
      const allSermons = await API.getSermons();
      mediaState.sermons = allSermons.filter(isPublic);
      const cats = ['All', ...new Set(mediaState.sermons.map(s => s.category))];
      const feat = mediaState.sermons.find(s => s.featured) || mediaState.sermons.find(s => s.video_id) || mediaState.sermons[0];
      $('#watchBody').innerHTML = `
        ${feat ? featureSermon(feat, true) : ''}
        <div class="mediabar">
          <div class="search">${icon.search}
            <input id="mediaSearch" type="search" placeholder="Search messages, speakers, series…" /></div>
          <div class="chips" id="mediaChips">
            ${cats.map(c => `<button class="chip ${c === mediaState.cat ? 'is-active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}
          </div>
        </div>
        <div class="grid" id="mediaGrid"></div>`;
      renderMediaGrid();
      $('#mediaSearch').addEventListener('input', e => { mediaState.q = e.target.value; renderMediaGrid(); });
      $('#mediaChips').addEventListener('click', e => {
        const b = e.target.closest('[data-cat]'); if (!b) return;
        mediaState.cat = b.dataset.cat;
        $$('.chip', $('#mediaChips')).forEach(c => c.classList.toggle('is-active', c === b));
        renderMediaGrid();
      });
    } catch (err) { console.error(err); $('#watchBody').innerHTML = `<div class="empty"><h3>Couldn't load messages</h3></div>`; }
  }

  function featureSermon(s, big = false) {
    return `
    <div class="feature-sermon${big ? '' : ' feature-sermon--home'}">
      <div class="feature-sermon__art" style="background:${grad(s.hue)}" data-play="${s.id}">
        ${icon.play}<span class="scard__dur">${esc(s.duration)}</span></div>
      <div class="feature-sermon__body">
        <span class="eyebrow">${big ? 'Featured' : 'Most recent'} · ${esc(s.series)}</span>
        <h2>${esc(s.title)}</h2>
        <div class="feature-sermon__meta">${esc(s.speaker)} · ${fmtDate(s.date)}</div>
        <p>${esc(s.blurb)}</p>
        <button class="btn btn--primary btn--lg" data-play="${s.id}">▶ Watch now</button>
      </div>
    </div>`;
  }

  function renderMediaGrid() {
    const grid = $('#mediaGrid'); if (!grid) return;
    const q = mediaState.q.trim().toLowerCase();
    const list = mediaState.sermons.filter(s => {
      const okCat = mediaState.cat === 'All' || s.category === mediaState.cat;
      const okQ = !q || [s.title, s.speaker, s.series, s.category].join(' ').toLowerCase().includes(q);
      return okCat && okQ;
    });
    if (!list.length) { grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><h3>No messages found</h3><p>Try another search or category.</p></div>`; return; }
    grid.innerHTML = list.map(scardHTML).join('');
  }
  function scardHTML(s) {
    return `
      <article class="scard" data-play="${esc(s.id)}">
        <div class="scard__art" style="background:${grad(s.hue)}">
          <span class="scard__badge">${esc(s.category)}</span>${icon.play}
          ${s.video_id ? (s.members_only === false ? '<span class="scard__lock scard__lock--free">🌐 Free</span>' : '<span class="scard__lock">🔒 Members</span>') : ''}
          <span class="scard__dur">${esc(s.duration)}</span></div>
        <div class="scard__body">
          <div class="scard__series">${esc(s.series)}</div>
          <h3>${esc(s.title)}</h3>
          <div class="scard__foot"><span>${esc(s.speaker || '')}</span><span>${fmtDate(s.date)}</span></div>
        </div>
      </article>`;
  }

  /* ---------- player modal ---------- */
  let playerTimer = null;
  function findSermon(id) {
    return (mediaState.sermons || []).find(x => x.id === id)
      || window.SEED.sermons.find(x => x.id === id);
  }
  function openPlayer(id) {
    const s = findSermon(id);
    if (!s) return;
    // Real bunny.net video → members-only, signed embed. No video → demo player.
    if (s.video_id) return openVideoPlayer(s);
    return openSimulatedPlayer(s);
  }

  // Members-only real video: gate on Auth0, then fetch a signed bunny embed URL.
  function videoShell(s, inner) {
    return `
      <button class="modal__close" data-close aria-label="Close">×</button>
      <div class="vplayer" id="vplayer" style="background:${grad(s.hue)}">${inner}</div>
      <div class="modal__body">
        <div class="scard__series">${esc(s.series)}</div>
        <h2>${esc(s.title)}</h2>
        <div class="meta">${esc(s.speaker)} · ${fmtDate(s.date)} · ${esc(s.category)}</div>
        <p>${esc(s.blurb)}</p></div>`;
  }
  async function openVideoPlayer(s) {
    const membersOnly = s.members_only !== false; // guest videos are open to everyone
    const gate = msg => `<div class="vgate">
        <div class="vgate__lock">🔒</div>
        <h3>Members only</h3>
        <p>${msg}</p>
        ${Auth.enabled ? `<button class="btn btn--white btn--lg" id="vLogin">Log in to watch</button>`
                       : `<p class="vgate__note">Member login isn't configured yet (add your Auth0 keys in <code>js/config.js</code>).</p>`}
      </div>`;

    // 1) Members-only + not signed in → show the login gate. (Guest videos skip this.)
    if (membersOnly && (!Auth.enabled || !Auth.user)) {
      $('#modalCard').innerHTML = videoShell(s, gate(Auth.enabled
        ? 'Sign in with your church account to watch this message.'
        : 'This message is reserved for members.'));
      openModal();
      const b = $('#vLogin'); if (b) b.onclick = () => Auth.login();
      return;
    }
    // 2) Allowed → ask our serverless function for a signed, short-lived embed.
    //    Guests get a signed URL without login; members send their Auth0 token.
    $('#modalCard').innerHTML = videoShell(s, `<div class="vloading"><span class="spin spin--light"></span>Loading video…</div>`);
    openModal();
    try {
      const token = (Auth.enabled && Auth.user) ? await Auth.getToken() : null;
      const r = await fetch(`/api/embed?video=${encodeURIComponent(s.video_id)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || `Error ${r.status}`); }
      const { url } = await r.json();
      const v = $('#vplayer');
      if (v) v.innerHTML = `<iframe src="${esc(url)}" loading="lazy" allow="accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture;fullscreen" allowfullscreen></iframe>`;
    } catch (e) {
      console.error(e);
      const v = $('#vplayer');
      if (v) v.innerHTML = `<div class="vgate"><div class="vgate__lock">⚠️</div><h3>Couldn't load video</h3><p>${esc(e.message)}</p></div>`;
    }
  }

  function openSimulatedPlayer(s) {
    const [mm, ss] = s.duration.split(':').map(Number); const total = mm * 60 + ss;
    $('#modalCard').innerHTML = `
      <button class="modal__close" data-close aria-label="Close">×</button>
      <div class="player" style="background:${grad(s.hue)}">
        <div class="player__big" id="pBig" role="button" aria-label="Play"></div>
        <div class="player__ui">
          <button class="player__btn" id="pToggle">▶</button>
          <div class="player__track" id="pTrack"><div class="player__fill" id="pFill"></div></div>
          <span class="player__time" id="pTime">0:00 / ${esc(s.duration)}</span></div></div>
      <div class="modal__body">
        <div class="scard__series">${esc(s.series)}</div>
        <h2>${esc(s.title)}</h2>
        <div class="meta">${esc(s.speaker)} · ${fmtDate(s.date)} · ${esc(s.category)}</div>
        <p>${esc(s.blurb)}</p></div>`;
    openModal();
    let cur = 0, playing = false;
    const fill = $('#pFill'), timeEl = $('#pTime'), big = $('#pBig'), toggle = $('#pToggle');
    const fmt = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    const paint = () => { fill.style.width = (cur / total * 100) + '%'; timeEl.textContent = `${fmt(cur)} / ${s.duration}`; };
    const play = () => { playing = true; big.classList.add('playing'); toggle.textContent = '❚❚'; clearInterval(playerTimer);
      playerTimer = setInterval(() => { cur += 2; if (cur >= total) { cur = total; paint(); pause(); return; } paint(); }, 250); };
    const pause = () => { playing = false; big.classList.remove('playing'); toggle.textContent = '▶'; clearInterval(playerTimer); };
    const tap = () => (playing ? pause() : play());
    big.onclick = tap; toggle.onclick = tap;
    $('#pTrack').onclick = e => { const r = e.currentTarget.getBoundingClientRect(); cur = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * total; paint(); };
    play();
  }

  /* ============================================================
     EVENTS
     ============================================================ */
  function events() {
    return `
    <section class="phead"><div class="container"><span class="eyebrow">Events</span>
      <h1 class="h-xl">Something for everyone</h1>
      <p class="lead">Gatherings, groups, and serving opportunities. Find your place and register in a tap.</p></div></section>
    <section class="section" style="padding-top:40px"><div class="container">
      <div class="events" id="eventsGrid">${spinner('Loading events…')}</div></div></section>`;
  }
  async function fillEvents() {
    try { const evs = await API.getEvents(); $('#eventsGrid').innerHTML = evs.map(eventCard).join(''); }
    catch (err) { console.error(err); $('#eventsGrid').innerHTML = `<div class="empty"><h3>Couldn't load events</h3></div>`; }
  }
  function eventCard(e) {
    const dp = dayParts(e.date);
    return `
    <article class="event">
      <div class="event__date" style="background:${grad(e.hue)}"><b>${dp.day}</b><span>${dp.mon}</span></div>
      <div>
        <span class="event__tag">${esc(e.tag)}</span>
        <h3>${esc(e.title)}</h3>
        <div class="event__meta"><span>${icon.clock} ${esc(e.time)}</span><span>${icon.pin} ${esc(e.location)}</span></div>
        <p>${esc(e.blurb)}</p>
        <button class="btn btn--primary btn--sm" data-rsvp="${esc(e.title)}">Register</button>
      </div>
    </article>`;
  }

  /* ---------- RSVP modal ---------- */
  function openRsvp(title) {
    $('#modalCard').innerHTML = `
      <button class="modal__close" data-close aria-label="Close">×</button>
      <div class="modal__body form-modal">
        <span class="eyebrow">Register</span>
        <h2>${esc(title)}</h2>
        <p class="meta">Save your spot — we'll send a reminder.</p>
        <form id="rsvpForm" class="form">
          <label class="label">Full name<input name="name" required placeholder="Your name" /></label>
          <label class="label">Email<input name="email" type="email" required placeholder="you@example.com" /></label>
          <label class="label">Number attending
            <select name="guests"><option>1</option><option>2</option><option>3</option><option>4</option><option>5+</option></select></label>
          <button class="btn btn--primary btn--lg btn--block" type="submit">Confirm registration</button>
        </form>
      </div>`;
    openModal();
    $('#rsvpForm').addEventListener('submit', async ev => {
      ev.preventDefault();
      const f = ev.target; const btn = f.querySelector('button');
      btn.disabled = true; btn.textContent = 'Saving…';
      try {
        await API.createRsvp({ event: title, name: f.name.value, email: f.email.value, guests: f.guests.value });
        closeModal(); toast(`✅ You're registered for “${title}”. See you there!`);
      } catch (e) { console.error(e); btn.disabled = false; btn.textContent = 'Confirm registration'; toast('Something went wrong — please try again.'); }
    });
  }

  /* ============================================================
     GROUPS / MINISTRIES
     ============================================================ */
  function groups() {
    return `
    <section class="phead"><div class="container"><span class="eyebrow">Groups &amp; Ministries</span>
      <h1 class="h-xl">You weren't meant to do life alone</h1>
      <p class="lead">From kids to adults, there's a place for you to connect, grow, and serve.</p></div></section>
    <section class="section" style="padding-top:40px"><div class="container">
      <div class="grid" id="groupsGrid">${spinner('Loading ministries…')}</div></div></section>`;
  }
  async function fillGroups() {
    try {
      const ms = await API.getMinistries();
      $('#groupsGrid').innerHTML = ms.map(m => `
        <article class="mcard">
          <div class="mcard__art" style="background:${grad(m.hue)}"><span>${esc(m.name)}</span></div>
          <div class="mcard__body">
            <div class="mcard__aud">${esc(m.audience)}</div>
            <p>${esc(m.blurb)}</p>
            <div class="mcard__foot"><span>${icon.clock} ${esc(m.when)}</span>
              <button class="btn btn--ghost btn--sm" data-rsvp="${esc(m.name)} — I'm interested">I'm interested</button></div>
          </div>
        </article>`).join('');
    } catch (err) { console.error(err); $('#groupsGrid').innerHTML = `<div class="empty"><h3>Couldn't load ministries</h3></div>`; }
  }

  /* ============================================================
     GIVE
     ============================================================ */
  let giveState = { freq: 'One time', amount: 50, custom: '', fund: window.SEED.funds[0] };

  function give() {
    return `
    <section class="phead"><div class="container"><span class="eyebrow">Give</span>
      <h1 class="h-xl">Your generosity changes lives</h1>
      <p class="lead">Thank you for supporting the mission of Grace. Give securely in seconds.</p></div></section>
    <section class="section" style="padding-top:40px"><div class="container">
      <div class="give-wrap" id="giveWrap">${giveForm()}</div></div></section>`;
  }
  function giveForm() {
    const presets = [25, 50, 100, 250, 500, 1000];
    const amt = currentAmount();
    return `
      <div class="give-card">
        <h2>Make a gift</h2>
        <p class="sub">${esc(C.church.name)} · Secure giving</p>
        <div class="freq" id="freq">
          ${['One time', 'Weekly', 'Monthly'].map(f => `<button data-freq="${f}" class="${f === giveState.freq ? 'is-active' : ''}">${f}</button>`).join('')}</div>
        <span class="label label--plain">Choose an amount</span>
        <div class="amounts" id="amounts">
          ${presets.map(a => `<button class="amt ${!giveState.custom && a === giveState.amount ? 'is-active' : ''}" data-amt="${a}">$${a}</button>`).join('')}</div>
        <div class="custom-amt"><span>$</span><input id="customAmt" type="number" min="1" step="1" placeholder="Other amount" value="${giveState.custom}" /></div>
        <div class="field"><span class="label label--plain">Give to</span>
          <select id="fund">${window.SEED.funds.map(f => `<option ${f === giveState.fund ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></div>
        <div class="give-total"><span class="label label--plain" style="margin:0">${giveState.freq} gift</span><b id="giveTotal">${money(amt)}</b></div>
        <button class="btn btn--primary btn--lg btn--block" id="giveBtn" style="margin-top:18px">${giveBtnLabel(amt)}</button>
        <p class="give-note">🔒 Demo build — no card details are collected and nothing is charged. In production this posts to your database (Supabase) and hands off to your payment processor.</p>
      </div>
      <div class="give-side">
        <div class="impact">
          <h3>Where your gift goes</h3>
          <div class="impact__row"><div class="impact__ic">🍞</div><div><b>$25 feeds a family</b><p>Groceries for a week through our food pantry.</p></div></div>
          <div class="impact__row"><div class="impact__ic">🌍</div><div><b>$100 supports missions</b><p>Fuels partners serving in 14 countries.</p></div></div>
          <div class="impact__row"><div class="impact__ic">🏗️</div><div><b>$250 builds hope</b><p>Invests in the new community center.</p></div></div>
        </div>
        <div class="impact">
          <h3>Other ways to give</h3>
          <div class="impact__row"><div class="impact__ic">📱</div><div><b>Text to give</b><p>Text GIVE to (555) 018-2200.</p></div></div>
          <div class="impact__row"><div class="impact__ic">✉️</div><div><b>By mail</b><p>${esc(C.church.address)}</p></div></div>
        </div>
      </div>`;
  }
  const giveBtnLabel = amt => `Give ${money(amt)}${giveState.freq !== 'One time' ? ' / ' + giveState.freq.toLowerCase() : ''}`;
  function currentAmount() {
    if (giveState.custom !== '' && !isNaN(+giveState.custom)) return Math.max(0, Math.round(+giveState.custom));
    return giveState.amount;
  }
  function refreshGiveTotal() {
    const amt = currentAmount();
    const t = $('#giveTotal'); if (t) t.textContent = money(amt);
    const b = $('#giveBtn'); if (b) b.textContent = giveBtnLabel(amt);
    const lbl = $('.give-total .label'); if (lbl) lbl.textContent = `${giveState.freq} gift`;
  }
  function wireGive() {
    const wrap = $('#giveWrap'); if (!wrap) return;
    wrap.addEventListener('click', e => {
      const f = e.target.closest('[data-freq]');
      if (f) { giveState.freq = f.dataset.freq; $$('#freq button').forEach(b => b.classList.toggle('is-active', b === f)); refreshGiveTotal(); return; }
      const a = e.target.closest('[data-amt]');
      if (a) { giveState.amount = +a.dataset.amt; giveState.custom = ''; const ci = $('#customAmt'); if (ci) ci.value = '';
        $$('.amt').forEach(b => b.classList.toggle('is-active', b === a)); refreshGiveTotal(); return; }
      if (e.target.id === 'giveBtn') submitGift();
    });
    wrap.addEventListener('input', e => { if (e.target.id === 'customAmt') { giveState.custom = e.target.value; $$('.amt').forEach(b => b.classList.remove('is-active')); refreshGiveTotal(); } });
    wrap.addEventListener('change', e => { if (e.target.id === 'fund') giveState.fund = e.target.value; });
  }
  async function submitGift() {
    const amt = currentAmount();
    if (amt < 1) { toast('Please enter an amount greater than $0.'); return; }
    const btn = $('#giveBtn'); btn.disabled = true; btn.textContent = 'Processing…';
    try {
      const rec = await API.createGift({ amount: amt, frequency: giveState.freq, fund: giveState.fund });
      const reference = rec.reference || ('GCC-' + Math.random().toString(36).slice(2, 8).toUpperCase());
      $('#giveWrap').innerHTML = `
        <div class="give-card" style="grid-column:1/-1;max-width:560px;margin:0 auto">
          <div class="give-success">
            <div class="give-success__check">${icon.check}</div>
            <h2>Thank you for your generosity!</h2>
            <p>Your ${giveState.freq.toLowerCase()} gift of <b>${money(amt)}</b> makes a real difference.</p>
            <div class="give-receipt">
              <div><span>Amount</span><b>${money(amt)}</b></div>
              <div><span>Frequency</span><b>${giveState.freq}</b></div>
              <div><span>Fund</span><b>${esc(giveState.fund)}</b></div>
              <div><span>Reference</span><b>${esc(reference)}</b></div>
              <div><span>Date</span><b>${fmtDate(new Date().toISOString().slice(0, 10))}</b></div>
            </div>
            <p class="give-note">${API.live ? 'Saved to your database.' : 'Demo — nothing was charged.'} A receipt would normally be emailed to you.</p>
            <div style="display:flex;gap:10px;margin-top:20px">
              <button class="btn btn--ghost btn--block" id="giveAgain">Give again</button>
              <a href="#/watch" class="btn btn--primary btn--block">Watch a message</a>
            </div>
          </div>
        </div>`;
      toast('🎉 Gift received — thank you!');
      $('#giveAgain')?.addEventListener('click', () => {
        giveState = { freq: 'One time', amount: 50, custom: '', fund: window.SEED.funds[0] };
        $('#giveWrap').innerHTML = giveForm(); wireGive();
      });
    } catch (e) { console.error(e); btn.disabled = false; btn.textContent = giveBtnLabel(amt); toast('Payment could not be processed — please try again.'); }
  }

  /* ============================================================
     PLAN A VISIT
     ============================================================ */
  function visit() {
    const ch = C.church;
    return `
    <section class="phead"><div class="container"><span class="eyebrow">Plan a Visit</span>
      <h1 class="h-xl">We can't wait to meet you</h1>
      <p class="lead">Here's everything you need to know before your first Sunday at ${esc(ch.shortName)}.</p></div></section>
    <section class="section" style="padding-top:40px"><div class="container visit-grid">
      <div>
        <div class="qa"><h3>When do you gather?</h3>
          ${ch.times.map(t => `<p><b>${esc(t.day)}</b> — ${esc(t.service)}, ${esc(t.time)}</p>`).join('')}</div>
        <div class="qa"><h3>Where are you located?</h3><p>${esc(ch.address)}</p>
          <p class="muted">Free parking with greeters ready to help you find your way.</p></div>
        <div class="qa"><h3>What should I wear?</h3><p>Come as you are — you'll see everything from jeans to Sunday best.</p></div>
        <div class="qa"><h3>What about my kids?</h3><p>Grace Kids offers safe, fun, age-appropriate environments at every service. Check-in opens 20 minutes early.</p></div>
        <div class="qa"><h3>How long is a service?</h3><p>About 75 minutes of worship and a practical, Bible-based message.</p></div>
      </div>
      <aside class="visit-card">
        <h3>Let us know you're coming</h3>
        <p class="muted">Fill this out and we'll have a welcome gift ready for you.</p>
        <form id="visitForm" class="form">
          <label class="label">Full name<input name="name" required placeholder="Your name" /></label>
          <label class="label">Email<input name="email" type="email" required placeholder="you@example.com" /></label>
          <label class="label">Which service?
            <select name="request">${ch.times.map(t => `<option>${esc(t.day)} — ${esc(t.time)}</option>`).join('')}</select></label>
          <label class="label">Anything we should know?<textarea name="note" rows="3" placeholder="Bringing kids, questions, etc."></textarea></label>
          <button class="btn btn--primary btn--lg btn--block" type="submit">I'm planning to visit</button>
          <p class="give-note">We'll only use this to help you feel at home.</p>
        </form>
      </aside>
    </div></section>`;
  }
  function wireVisit() {
    const f = $('#visitForm'); if (!f) return;
    f.addEventListener('submit', async ev => {
      ev.preventDefault(); const btn = f.querySelector('button'); btn.disabled = true; btn.textContent = 'Sending…';
      try {
        await API.createPrayer({ name: f.name.value, email: f.email.value, request: `[PLAN A VISIT · ${f.request.value}] ${f.note.value}`, is_private: true });
        f.closest('.visit-card').innerHTML = `<div class="give-success"><div class="give-success__check">${icon.check}</div>
          <h2>You're on the list!</h2><p>Thanks, ${esc(f.name.value.split(' ')[0])}. Someone from our team will reach out, and we'll have a gift ready for you on Sunday.</p></div>`;
        toast('🎉 See you Sunday!');
      } catch (e) { console.error(e); btn.disabled = false; btn.textContent = "I'm planning to visit"; toast('Something went wrong — please try again.'); }
    });
  }

  /* ============================================================
     PRAYER / CONTACT
     ============================================================ */
  function prayer() {
    return `
    <section class="phead"><div class="container"><span class="eyebrow">Prayer &amp; Contact</span>
      <h1 class="h-xl">How can we pray for you?</h1>
      <p class="lead">Our prayer team would be honored to pray with you. Nothing is too big or too small.</p></div></section>
    <section class="section" style="padding-top:40px"><div class="container prayer-grid">
      <div class="prayer-card">
        <form id="prayerForm" class="form">
          <label class="label">Your name<input name="name" required placeholder="Your name" /></label>
          <label class="label">Email (optional)<input name="email" type="email" placeholder="you@example.com" /></label>
          <label class="label">Your request<textarea name="request" rows="5" required placeholder="Share what's on your heart…"></textarea></label>
          <label class="check"><input type="checkbox" name="private" checked /> Keep this private (prayer team only)</label>
          <button class="btn btn--primary btn--lg btn--block" type="submit">Send prayer request</button>
        </form>
      </div>
      <aside class="contact-side">
        <div class="impact"><h3>Get in touch</h3>
          <div class="impact__row"><div class="impact__ic">📍</div><div><b>Visit</b><p>${esc(C.church.address)}</p></div></div>
          <div class="impact__row"><div class="impact__ic">✉️</div><div><b>Email</b><p>${esc(C.church.email)}</p></div></div>
          <div class="impact__row"><div class="impact__ic">📞</div><div><b>Call</b><p>${esc(C.church.phone)}</p></div></div>
        </div>
      </aside>
    </div></section>`;
  }
  function wirePrayer() {
    const f = $('#prayerForm'); if (!f) return;
    f.addEventListener('submit', async ev => {
      ev.preventDefault(); const btn = f.querySelector('button'); btn.disabled = true; btn.textContent = 'Sending…';
      try {
        await API.createPrayer({ name: f.name.value, email: f.email.value, request: f.request.value, is_private: f.private.checked });
        f.closest('.prayer-card').innerHTML = `<div class="give-success"><div class="give-success__check">${icon.check}</div>
          <h2>We're praying for you</h2><p>Thank you for trusting us, ${esc(f.name.value.split(' ')[0])}. Our team has received your request.</p></div>`;
        toast('🙏 Your request has been received.');
      } catch (e) { console.error(e); btn.disabled = false; btn.textContent = 'Send prayer request'; toast('Something went wrong — please try again.'); }
    });
  }

  /* ============================================================
     ADMIN (staff, Supabase Auth)
     ============================================================ */
  function admin() {
    return `
    <section class="phead"><div class="container"><span class="eyebrow">Staff</span>
      <h1 class="h-xl">Admin dashboard</h1>
      <p class="lead">Sign in to view giving, registrations, and prayer requests.</p></div></section>
    <section class="section" style="padding-top:40px"><div class="container" id="adminRoot">${spinner('Checking session…')}</div></section>`;
  }
  async function initAdmin() {
    if (!$('#adminRoot')) return;
    let user = null;
    try { user = await API.adminUser(); } catch (e) { console.warn(e); }
    if (user) renderAdminDash(user); else renderAdminLogin();
  }
  function renderAdminLogin() {
    const root = $('#adminRoot'); if (!root) return;
    root.innerHTML = `
      <div class="admin-login">
        <h2>Staff sign in</h2>
        <p class="muted">${API.live ? 'Use your Supabase staff account.' : 'Demo mode — any email &amp; password works.'}</p>
        <form id="adminLoginForm" class="form">
          <label class="label">Email<input name="email" type="email" required placeholder="you@church.org" autocomplete="username" /></label>
          <label class="label">Password<input name="password" type="password" required placeholder="••••••••" autocomplete="current-password" /></label>
          <button class="btn btn--primary btn--lg btn--block" type="submit">Sign in</button>
        </form>
      </div>`;
    $('#adminLoginForm').addEventListener('submit', async ev => {
      ev.preventDefault(); const f = ev.target, btn = f.querySelector('button');
      btn.disabled = true; btn.textContent = 'Signing in…';
      try { const u = await API.adminSignIn(f.email.value, f.password.value); renderAdminDash(u); toast('Welcome back!'); }
      catch (e) { console.error(e); btn.disabled = false; btn.textContent = 'Sign in'; toast(e.message || 'Sign in failed.'); }
    });
  }
  async function renderAdminDash(user) {
    const root = $('#adminRoot'); if (!root) return;
    root.innerHTML = `
      <div class="admin-head">
        <div><h2>Welcome, ${esc(user.email)}</h2><p class="muted">${API.live ? 'Live data from your database.' : 'Demo data from this browser.'}</p></div>
        <button class="btn btn--ghost" id="adminLogout">Log out</button></div>
      <div class="admin-cards" id="adminCards">${spinner('Loading submissions…')}</div>
      <div class="admin-tabs" id="adminTabs"></div>
      <div id="adminPanel"></div>`;
    $('#adminLogout').onclick = async () => { await API.adminSignOut(); renderAdminLogin(); toast('Signed out.'); };
    try {
      const [gifts, rsvps, prayers] = await Promise.all([API.listGifts(), API.listRsvps(), API.listPrayers()]);
      const total = gifts.reduce((s, g) => s + Number(g.amount || 0), 0);
      $('#adminCards').innerHTML =
        adminStat(money(total), 'Total given', gifts.length + ' gifts') +
        adminStat(rsvps.length, 'Registrations', 'event RSVPs') +
        adminStat(prayers.length, 'Prayer requests', 'received');
      const tabs = [
        ['Gifts', () => giftsTable(gifts)],
        ['RSVPs', () => rsvpsTable(rsvps)],
        ['Prayer', () => prayersList(prayers)],
        ['Messages', () => contentPanel('sermons')],
        ['Events', () => contentPanel('events')],
        ['Ministries', () => contentPanel('ministries')],
        ['Site settings', () => settingsPanel()]
      ];
      const tabsEl = $('#adminTabs'), panel = $('#adminPanel');
      tabsEl.innerHTML = tabs.map((t, i) => `<button class="atab ${i === 0 ? 'is-active' : ''}" data-i="${i}">${t[0]}</button>`).join('');
      const show = i => { panel.innerHTML = tabs[i][1](); $$('.atab', tabsEl).forEach((b, j) => b.classList.toggle('is-active', j === i)); };
      tabsEl.onclick = e => { const b = e.target.closest('[data-i]'); if (b) show(+b.dataset.i); };
      show(0);
    } catch (e) { console.error(e); $('#adminCards').innerHTML = `<div class="empty"><p>Couldn't load data.</p><p class="muted">${esc(e.message || '')}</p></div>`; }
  }
  const adminStat = (b, l, s) => `<div class="astat"><b>${b}</b><span>${l}</span><i>${s}</i></div>`;
  function giftsTable(rows) {
    if (!rows.length) return emptyTable('No gifts yet.');
    return table(['Date', 'Amount', 'Frequency', 'Fund', 'Reference'],
      rows.map(g => [fmtDateTime(g.created_at), money(g.amount), g.frequency, g.fund, g.reference || '—']));
  }
  function rsvpsTable(rows) {
    if (!rows.length) return emptyTable('No registrations yet.');
    return table(['Date', 'Event', 'Name', 'Email', 'Guests'],
      rows.map(r => [fmtDateTime(r.created_at), r.event, r.name, r.email || '—', r.guests || '—']));
  }
  function prayersList(rows) {
    if (!rows.length) return emptyTable('No prayer requests yet.');
    return `<div class="prayer-feed">${rows.map(p => `
      <div class="pr">
        <div class="pr__head"><b>${esc(p.name)}</b><span>${p.is_private ? '🔒 Private' : '🌐 Shareable'} · ${fmtDateTime(p.created_at)}</span></div>
        <p>${esc(p.request)}</p>
        ${p.email ? `<a href="mailto:${esc(p.email)}" class="pr__mail">${esc(p.email)}</a>` : ''}
      </div>`).join('')}</div>`;
  }
  function table(head, rows) {
    return `<div class="atable-wrap"><table class="atable">
      <thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  const emptyTable = msg => `<div class="empty"><p>${esc(msg)}</p></div>`;

  /* ---------- bunny.net sync (imports videos as sermons) ---------- */
  async function doSyncSermons(btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Syncing…'; }
    try {
      const r = await API.syncVideos();
      toast(r.added ? `Imported ${r.added} new video${r.added === 1 ? '' : 's'} from bunny.net (as drafts).` : `Up to date — ${r.total} video${r.total === 1 ? '' : 's'} in your library.`);
      fillContentPanel('sermons');
    } catch (e) { console.error(e); toast(e.message || 'Sync failed.'); if (btn) { btn.disabled = false; btn.textContent = '↻ Sync from bunny.net'; } }
  }

  /* ---------- content management (CMS) ---------- */
  const contentDefs = {
    sermons: {
      singular: 'message', list: () => API.getSermons(), save: r => API.saveSermon(r), del: id => API.deleteSermon(id),
      sync: true,
      label: r => r.title, sub: r => `${r.speaker || ''} · ${r.series || ''} · ${r.date ? fmtDate(r.date) : ''}`,
      badges: r => `${isPublic(r) ? '<i class="pub pub--on">Published</i>' : '<i class="pub">Draft</i>'}`
        + (r.video_id ? (r.members_only === false ? ' · <i class="pub pub--guest">🌐 Guest</i>' : ' · <i class="pub">🔒 Members</i>') : ''),
      fields: [
        { name: 'title', label: 'Title', required: true },
        { name: 'speaker', label: 'Speaker', required: true },
        { name: 'series', label: 'Series' },
        { name: 'date', label: 'Date', type: 'date', required: true },
        { name: 'duration', label: 'Duration (mm:ss)', placeholder: '34:20' },
        { name: 'category', label: 'Category', placeholder: 'Faith' },
        { name: 'video_id', label: 'Bunny video ID (GUID) — leave blank for no video', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
        { name: 'published', label: 'Published (visible on the site)', type: 'checkbox', default: true },
        { name: 'members_only', label: 'Members-only (require login to watch)', type: 'checkbox', default: true },
        { name: 'hue', label: 'Color hue (0–360)', type: 'number', default: 212 },
        { name: 'featured', label: 'Feature on the home page', type: 'checkbox' },
        { name: 'blurb', label: 'Description', type: 'textarea' }
      ]
    },
    events: {
      singular: 'event', list: () => API.getEvents(), save: r => API.saveEvent(r), del: id => API.deleteEvent(id),
      label: r => r.title, sub: r => `${r.date ? fmtDate(r.date) : ''} · ${r.time || ''} · ${r.location || ''}`,
      fields: [
        { name: 'title', label: 'Title', required: true },
        { name: 'date', label: 'Date', type: 'date', required: true },
        { name: 'time', label: 'Time', placeholder: '7:00 PM' },
        { name: 'location', label: 'Location', placeholder: 'Main Auditorium' },
        { name: 'tag', label: 'Tag', placeholder: 'Special' },
        { name: 'hue', label: 'Color hue (0–360)', type: 'number', default: 212 },
        { name: 'blurb', label: 'Description', type: 'textarea' }
      ]
    },
    ministries: {
      singular: 'ministry', list: () => API.getMinistries(), save: r => API.saveMinistry(r), del: id => API.deleteMinistry(id),
      label: r => r.name, sub: r => `${r.audience || ''} · ${r.when || ''}`,
      fields: [
        { name: 'name', label: 'Name', required: true },
        { name: 'audience', label: 'Audience', placeholder: 'Ages 18–30' },
        { name: 'when', label: 'When', placeholder: 'Sundays 9 AM' },
        { name: 'hue', label: 'Color hue (0–360)', type: 'number', default: 212 },
        { name: 'blurb', label: 'Description', type: 'textarea' }
      ]
    }
  };

  function contentPanel(type) { setTimeout(() => fillContentPanel(type), 0); return `<div id="cpanel">${spinner('Loading ' + type + '…')}</div>`; }
  async function fillContentPanel(type) {
    const def = contentDefs[type], panel = $('#cpanel'); if (!panel) return;
    try {
      const rows = await def.list();
      panel.innerHTML = `
        <div class="cbar"><span class="muted">${rows.length} ${type}</span>
          <span style="display:flex;gap:8px">
            ${def.sync ? `<button class="btn btn--ghost btn--sm" data-sync="${type}">↻ Sync from bunny.net</button>` : ''}
            <button class="btn btn--primary btn--sm" data-add="${type}">+ Add ${def.singular}</button></span></div>
        <div class="clist">${rows.map(r => `
          <div class="crow">
            <span class="crow__sw${r.video_id ? ' crow__sw--play' : ''}" style="background:${grad(r.hue || 212)}">${r.video_id ? '▶' : ''}</span>
            <div class="crow__main"><b>${esc(def.label(r))}</b>
              <span>${esc(def.sub(r))}</span>
              ${def.badges ? `<span class="crow__badges">${def.badges(r)}</span>` : ''}</div>
            <div class="crow__act">
              <button class="btn btn--ghost btn--sm" data-edit="${type}" data-id="${esc(r.id)}">Edit</button>
              <button class="btn btn--ghost btn--sm" data-del="${type}" data-id="${esc(r.id)}">Delete</button>
            </div>
          </div>`).join('') || emptyTable('Nothing here yet — add one.')}</div>`;
    } catch (e) { console.error(e); panel.innerHTML = `<div class="empty"><p>Couldn't load.</p><p class="muted">${esc(e.message || '')}</p></div>`; }
  }

  function fieldHTML(f, val) {
    const v = (val ?? f.default ?? '');
    if (f.type === 'textarea') return `<label class="label">${f.label}<textarea name="${f.name}" rows="3" ${f.required ? 'required' : ''}>${esc(v)}</textarea></label>`;
    if (f.type === 'checkbox') return `<label class="check"><input type="checkbox" name="${f.name}" ${v ? 'checked' : ''}/> ${f.label}</label>`;
    return `<label class="label">${f.label}<input name="${f.name}" type="${f.type || 'text'}" ${f.required ? 'required' : ''} value="${esc(v)}" ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''}/></label>`;
  }
  function openEditor(type, item) {
    const def = contentDefs[type], isNew = !item, data = item || {};
    $('#modalCard').innerHTML = `
      <button class="modal__close" data-close aria-label="Close">×</button>
      <div class="modal__body form-modal">
        <span class="eyebrow">${isNew ? 'Add' : 'Edit'} ${def.singular}</span>
        <h2>${isNew ? 'New ' + def.singular : esc(def.label(data))}</h2>
        <form id="editForm" class="form">
          ${def.fields.map(f => fieldHTML(f, data[f.name])).join('')}
          <div style="display:flex;gap:10px;margin-top:6px">
            <button type="button" class="btn btn--ghost btn--block" data-close>Cancel</button>
            <button type="submit" class="btn btn--primary btn--block">${isNew ? 'Create' : 'Save changes'}</button>
          </div>
        </form>
      </div>`;
    openModal();
    $('#editForm').addEventListener('submit', async ev => {
      ev.preventDefault(); const f = ev.target, btn = f.querySelector('button[type=submit]');
      btn.disabled = true; btn.textContent = 'Saving…';
      const row = { id: data.id || (type[0] + Date.now().toString(36)) };
      def.fields.forEach(fl => {
        const el = f.querySelector(`[name="${fl.name}"]`);
        if (fl.type === 'checkbox') row[fl.name] = el.checked;
        else if (fl.type === 'number') row[fl.name] = el.value === '' ? null : Number(el.value);
        else row[fl.name] = el.value;
      });
      try { await def.save(row); closeModal(); toast('Saved.'); fillContentPanel(type); }
      catch (e) { console.error(e); btn.disabled = false; btn.textContent = isNew ? 'Create' : 'Save changes'; toast(e.message || 'Save failed.'); }
    });
  }
  async function openEditorById(type, id) {
    const rows = await contentDefs[type].list();
    openEditor(type, rows.find(r => String(r.id) === String(id)));
  }
  async function handleDelete(type, id) {
    if (!window.confirm('Delete this ' + contentDefs[type].singular + '? This cannot be undone.')) return;
    try { await contentDefs[type].del(id); toast('Deleted.'); fillContentPanel(type); }
    catch (e) { console.error(e); toast(e.message || 'Delete failed.'); }
  }

  /* ---------- editable site settings ---------- */
  const sField = (n, l, v) => `<label class="label">${l}<input name="${n}" value="${esc(v || '')}"/></label>`;
  const timeRow = t => `<div class="trow">
    <input data-k="day" placeholder="Day" value="${esc(t.day || '')}"/>
    <input data-k="service" placeholder="Service" value="${esc(t.service || '')}"/>
    <input data-k="time" placeholder="Time" value="${esc(t.time || '')}"/>
    <button type="button" class="trow-del" aria-label="Remove">×</button></div>`;
  function settingsPanel() { setTimeout(fillSettingsPanel, 0); return `<div id="cpanel">${spinner('Loading settings…')}</div>`; }
  async function fillSettingsPanel() {
    const panel = $('#cpanel'); if (!panel) return;
    const s = await API.getSettings();
    panel.innerHTML = `
      <form id="settingsForm" class="form settings-form">
        <p class="muted">These control the public site — header, footer, home page, and Plan a Visit.</p>
        <div class="sform-grid">${sField('name', 'Church name', s.name)}${sField('shortName', 'Short name', s.shortName)}</div>
        ${sField('tagline', 'Tagline', s.tagline)}
        <div class="sform-grid">${sField('phone', 'Phone', s.phone)}${sField('email', 'Email', s.email)}</div>
        ${sField('address', 'Address', s.address)}
        <div class="stimes">
          <span class="label--plain">Service times</span>
          <div id="timesRows">${(s.times || []).map(timeRow).join('')}</div>
          <button type="button" class="btn btn--ghost btn--sm" id="addTime">+ Add a time</button>
        </div>
        <button type="submit" class="btn btn--primary btn--lg" style="margin-top:6px">Save site settings</button>
      </form>`;
    const rows = $('#timesRows');
    $('#addTime').onclick = () => rows.insertAdjacentHTML('beforeend', timeRow({}));
    rows.addEventListener('click', e => { const b = e.target.closest('.trow-del'); if (b) b.closest('.trow').remove(); });
    $('#settingsForm').addEventListener('submit', async ev => {
      ev.preventDefault(); const f = ev.target, btn = f.querySelector('button[type=submit]');
      btn.disabled = true; btn.textContent = 'Saving…';
      const times = $$('.trow', rows).map(r => ({
        day: r.querySelector('[data-k=day]').value, service: r.querySelector('[data-k=service]').value, time: r.querySelector('[data-k=time]').value
      })).filter(t => t.day || t.time);
      const o = {
        name: f.querySelector('[name=name]').value, shortName: f.querySelector('[name=shortName]').value,
        tagline: f.querySelector('[name=tagline]').value, phone: f.querySelector('[name=phone]').value,
        email: f.querySelector('[name=email]').value, address: f.querySelector('[name=address]').value, times
      };
      try { await API.saveSettings(o); C.church = { ...C.church, ...o }; paintChrome(); toast('Site settings saved — the public site is updated.'); }
      catch (e) { console.error(e); toast(e.message || 'Save failed.'); }
      finally { btn.disabled = false; btn.textContent = 'Save site settings'; }
    });
  }

  /* ============================================================
     MODAL + ROUTER
     ============================================================ */
  const modal = document.getElementById('modal');
  function openModal() { modal.classList.add('is-open'); modal.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden'; }
  function closeModal() { modal.classList.remove('is-open'); modal.setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; clearInterval(playerTimer); $('#modalCard').innerHTML = ''; }
  modal.addEventListener('click', e => { if (e.target.dataset.close !== undefined) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  const routes = {
    '/': { render: home, after: fillHome },
    '/watch': { render: watch, after: fillWatch },
    '/events': { render: events, after: fillEvents },
    '/groups': { render: groups, after: fillGroups },
    '/give': { render: give, after: () => wireGive() },
    '/visit': { render: visit, after: wireVisit },
    '/prayer': { render: prayer, after: wirePrayer },
    '/admin': { render: admin, after: initAdmin }
  };

  function router() {
    const path = location.hash.replace('#', '') || '/';
    const r = routes[path] || routes['/'];
    view.innerHTML = r.render();
    window.scrollTo(0, 0);
    setActiveNav(path);
    initReveal();
    closeMenu();
    if (r.after) r.after();
  }
  function setActiveNav(path) { $$('.nav__links a').forEach(a => a.classList.toggle('is-active', a.getAttribute('href') === '#' + path)); }

  /* ---------- global delegated clicks ---------- */
  document.addEventListener('click', e => {
    const play = e.target.closest('[data-play]'); if (play) { openPlayer(play.dataset.play); return; }
    const rsvp = e.target.closest('[data-rsvp]'); if (rsvp) { openRsvp(rsvp.dataset.rsvp); return; }
    const add = e.target.closest('[data-add]'); if (add) { openEditor(add.dataset.add, null); return; }
    const edit = e.target.closest('[data-edit]'); if (edit) { openEditorById(edit.dataset.edit, edit.dataset.id); return; }
    const del = e.target.closest('[data-del]'); if (del) { handleDelete(del.dataset.del, del.dataset.id); return; }
    const sync = e.target.closest('[data-sync]'); if (sync) { doSyncSermons(sync); }
  });

  /* ---------- mobile menu ---------- */
  const nav = document.getElementById('nav'), burger = document.getElementById('burger');
  function closeMenu() { nav.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); }
  burger.addEventListener('click', () => { const open = nav.classList.toggle('open'); burger.setAttribute('aria-expanded', String(open)); });

  /* ---------- reveal on scroll ---------- */
  let io;
  function initReveal() {
    if (io) io.disconnect();
    io = new IntersectionObserver(entries => entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { threshold: 0.1 });
    $$('.reveal').forEach(el => io.observe(el));
  }

  /* ---------- chrome: footer + auth ---------- */
  function paintChrome() {
    const ch = C.church;
    document.title = ch.name;
    $('#brandName').textContent = ch.shortName || ch.name;
    $('#footBrand').textContent = ch.name;
    $('#footTag').textContent = ch.tagline;
    $('#footAddr').textContent = `${ch.address} · ${ch.phone}`;
    $('#footTimes').innerHTML = (ch.times || []).map(t => `<div><b>${esc(t.day)}</b> ${esc(t.time)}</div>`).join('');
    $('#modeTag').textContent = API.live ? 'Connected · Supabase' : 'Demo build · mock data';
  }
  async function paintAuth() {
    const slot = $('#authSlot'); if (!slot) return;
    if (!Auth.enabled) { slot.innerHTML = ''; return; }
    const user = await Auth.init();
    if (user) {
      const name = esc((user.given_name || user.name || user.email || 'Member').split('@')[0].split(' ')[0]);
      slot.innerHTML = `<span class="who" title="${esc(user.email || '')}"><span class="who__dot"></span>${name}</span>
        <button class="btn btn--ghost btn--sm" id="logoutBtn">Log out</button>`;
      $('#logoutBtn').onclick = () => Auth.logout();
    } else {
      slot.innerHTML = `<button class="btn btn--ghost" id="loginBtn">Member log in</button>`;
      $('#loginBtn').onclick = () => Auth.login();
    }
  }

  /* ---------- boot ---------- */
  // Load site settings BEFORE the first paint so the page never flashes the
  // local placeholder church data and then swaps to the real one. Cap the
  // wait so a slow/unreachable API falls back to local defaults instead of
  // leaving the page stuck on the loading spinner.
  window.addEventListener('hashchange', router);
  view.innerHTML = spinner('Loading…');
  const timeout = (ms) => new Promise(r => setTimeout(r, ms, null));
  (async function boot() {
    try {
      const s = await Promise.race([API.getSettings(), timeout(4000)]);
      if (s) C.church = { ...C.church, ...s, times: (s.times && s.times.length) ? s.times : C.church.times };
    } catch (e) { console.warn('settings load failed', e); }
    paintChrome();
    paintAuth();
    router();
  })();
})();

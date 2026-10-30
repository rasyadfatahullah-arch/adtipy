/* ADTIFY — by jiyyad tools | Spotify-style player */
(function () {
  'use strict';

  const LEHZZ = 'https://lehzzmusify.vercel.app';
  const FUKU = 'https://api.fuku.eu.cc/api/ytmp3';
  const API_KEY = 'fukuxyz_6f3714';

  const ARTS = ['The Weeknd', 'Taylor Swift', 'Billie Eilish', 'Bruno Mars', 'Olivia Rodrigo', 'Tulus', 'Sheila On 7', 'NIKI', 'Ed Sheeran', 'Hindia'];
  const GENRES = ['Pop', 'Synth-Pop', 'Indie', 'R&B', 'Pop Rock', 'Hits Indonesia', 'Lo-Fi Chill', 'Akustik Santai'];

  const PUBLIC_PLAYLISTS = [
    { id: 'hits-indo', name: 'Hits Indonesia', desc: 'Lagu hits tanah air', emoji: '🇮🇩', color: 'linear-gradient(135deg,#1db954,#0d5c2a)', query: 'hits indonesia' },
    { id: 'chill', name: 'Chill Vibes', desc: 'Santai & tenang', emoji: '🌊', color: 'linear-gradient(135deg,#509bf5,#1e3a6e)', query: 'lofi chill' },
    { id: 'pop-global', name: 'Global Pop', desc: 'Chart pop dunia', emoji: '🌍', color: 'linear-gradient(135deg,#e13300,#7a1a00)', query: 'pop hits 2024' },
    { id: 'rnb', name: 'R&B Soul', desc: 'Smooth & soulful', emoji: '💜', color: 'linear-gradient(135deg,#8d67ab,#3d2a4e)', query: 'r&b soul' },
    { id: 'indie', name: 'Indie Discover', desc: 'Temukan indie baru', emoji: '🎸', color: 'linear-gradient(135deg,#ba5d07,#5c2e03)', query: 'indie alternative' },
    { id: 'acoustic', name: 'Acoustic Night', desc: 'Gitar & vokal', emoji: '🌙', color: 'linear-gradient(135deg,#5038a0,#251a4a)', query: 'acoustic' }
  ];

  let queue = [];
  let currentIndex = -1;
  let favorites = loadJSON('adtify_favs', []);
  let recent = loadJSON('adtify_recent', []);
  let feedData = null;
  let currentSlot = 'pagi';
  let syncedLyrics = [];
  let ytPlayer = null;
  let ytReady = false;
  let progressTimer = null;
  let songDuration = 0;
  let shuffleOn = false;
  let repeatOn = false;
  let libTab = 'favs';
  let playMode = 'none'; // 'audio' | 'youtube'
  let audioEl = null;
  let streamCache = {}; // ytId -> download url

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  function loadJSON(k, def) {
    try { return JSON.parse(localStorage.getItem(k) || JSON.stringify(def)); }
    catch { return def; }
  }
  function saveJSON(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 2400);
  }
  function fmtTime(sec) {
    if (!sec || isNaN(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ':' + String(s).padStart(2, '0');
  }
  async function request(url, params) {
    params = params || {};
    const u = new URL(url);
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
    const res = await fetch(u.toString(), { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }
  function getTracks(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.tracks)) return data.tracks;
    if (data && Array.isArray(data.result)) return data.result;
    return [];
  }
  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }
  function getYtId(song) {
    if (!song) return null;
    if (song.youtubeId) return song.youtubeId;
    const id = (song.id || '').replace(/^yt-/, '');
    if (id && id.length === 11) return id;
    const m = (song.audioUrl || '').match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
  }
  function coverOf(song) {
    const id = getYtId(song);
    return song.coverUrl || (id ? 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg' : '');
  }

  /* Greeting */
  function setGreeting() {
    const h = new Date().getHours();
    let g = 'Selamat datang';
    if (h < 11) g = 'Selamat pagi';
    else if (h < 15) g = 'Selamat siang';
    else if (h < 18) g = 'Selamat sore';
    else g = 'Selamat malam';
    $('#greeting').textContent = g;
  }

  /* ========== Player: HTML5 Audio (background) + YT fallback ========== */
  audioEl = document.getElementById('audio-el');

  window.onYouTubeIframeAPIReady = function () {
    ytPlayer = new YT.Player('yt-host', {
      height: '1', width: '1',
      playerVars: { autoplay: 0, controls: 0, disablekb: 1, fs: 0, modestbranding: 1, rel: 0, playsinline: 1 },
      events: {
        onReady: function () { ytReady = true; },
        onStateChange: onYtState,
        onError: function () {
          if (playMode === 'youtube') {
            toast('Preview gagal, coba lagu lain');
            setPlayingUI(false);
            stopProgress();
          }
        }
      }
    });
  };
  if (window.YT && window.YT.Player) window.onYouTubeIframeAPIReady();

  function onYtState(e) {
    if (playMode !== 'youtube') return;
    if (e.data === 1) { setPlayingUI(true); startProgress(); updateMediaSession(); }
    else if (e.data === 2) { setPlayingUI(false); stopProgress(); }
    else if (e.data === 0) { onTrackEnded(); }
  }

  if (audioEl) {
    audioEl.addEventListener('play', function () {
      if (playMode === 'audio') { setPlayingUI(true); startProgress(); updateMediaSession(); }
    });
    audioEl.addEventListener('pause', function () {
      if (playMode === 'audio') { setPlayingUI(false); stopProgress(); }
    });
    audioEl.addEventListener('ended', function () {
      if (playMode === 'audio') onTrackEnded();
    });
    audioEl.addEventListener('error', function () {
      if (playMode === 'audio') {
        console.warn('audio error, fallback youtube');
        var song = queue[currentIndex];
        if (song) playViaYoutube(song);
      }
    });
    audioEl.addEventListener('loadedmetadata', function () {
      if (audioEl.duration && isFinite(audioEl.duration)) {
        songDuration = audioEl.duration;
        var d = document.getElementById('np-dur');
        if (d) d.textContent = fmtTime(songDuration);
      }
    });
  }

  function onTrackEnded() {
    setPlayingUI(false);
    stopProgress();
    if (repeatOn) playTrack(queue, currentIndex);
    else if (currentIndex < queue.length - 1) playTrack(queue, currentIndex + 1);
    else if (shuffleOn && queue.length) playTrack(queue, Math.floor(Math.random() * queue.length));
  }

  function startProgress() {
    stopProgress();
    progressTimer = setInterval(function () {
      var t = 0, d = songDuration || 0;
      try {
        if (playMode === 'audio' && audioEl) {
          t = audioEl.currentTime || 0;
          d = audioEl.duration || songDuration || 0;
        } else if (playMode === 'youtube' && ytPlayer && typeof ytPlayer.getCurrentTime === 'function') {
          t = ytPlayer.getCurrentTime() || 0;
          d = ytPlayer.getDuration() || songDuration || 0;
        }
      } catch (_) {}
      if (d > 0) {
        var pct = (t / d) * 100;
        var mf = document.getElementById('mini-fill');
        var nf = document.getElementById('np-bar-fill');
        var nk = document.getElementById('np-bar-knob');
        var nc = document.getElementById('np-cur');
        var nd = document.getElementById('np-dur');
        if (mf) mf.style.width = pct + '%';
        if (nf) nf.style.width = pct + '%';
        if (nk) nk.style.left = pct + '%';
        if (nc) nc.textContent = fmtTime(t);
        if (nd) nd.textContent = fmtTime(d);
        updateSyncedLyrics(t);
        if ('mediaSession' in navigator && navigator.mediaSession.setPositionState) {
          try {
            navigator.mediaSession.setPositionState({ duration: d, playbackRate: 1, position: t });
          } catch (_) {}
        }
      }
    }, 250);
  }
  function stopProgress() {
    if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
  }

  function setPlayingUI(playing) {
    document.querySelectorAll('.ic-play').forEach(function (el) { el.style.display = playing ? 'none' : 'block'; });
    document.querySelectorAll('.ic-pause').forEach(function (el) { el.style.display = playing ? 'block' : 'none'; });
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
    }
  }

  function playerPause() {
    try {
      if (playMode === 'audio' && audioEl) audioEl.pause();
      else if (playMode === 'youtube' && ytPlayer) ytPlayer.pauseVideo();
    } catch (_) {}
  }
  function playerPlay() {
    try {
      if (playMode === 'audio' && audioEl) {
        var p = audioEl.play();
        if (p && p.catch) p.catch(function () { toast('Ketuk play untuk lanjut'); });
      } else if (playMode === 'youtube' && ytPlayer) ytPlayer.playVideo();
    } catch (_) {}
  }
  function playerSeek(sec) {
    try {
      if (playMode === 'audio' && audioEl) audioEl.currentTime = sec;
      else if (playMode === 'youtube' && ytPlayer) ytPlayer.seekTo(sec, true);
    } catch (_) {}
  }
  function playerGetTime() {
    try {
      if (playMode === 'audio' && audioEl) return audioEl.currentTime || 0;
      if (playMode === 'youtube' && ytPlayer) return ytPlayer.getCurrentTime() || 0;
    } catch (_) {}
    return 0;
  }
  function playerGetDuration() {
    try {
      if (playMode === 'audio' && audioEl && audioEl.duration) return audioEl.duration;
      if (playMode === 'youtube' && ytPlayer) return ytPlayer.getDuration() || songDuration;
    } catch (_) {}
    return songDuration || 0;
  }
  function playerIsPlaying() {
    try {
      if (playMode === 'audio' && audioEl) return !audioEl.paused;
      if (playMode === 'youtube' && ytPlayer) return ytPlayer.getPlayerState() === 1;
    } catch (_) {}
    return false;
  }

  /* Media Session — background / lock screen / notifikasi */
  function updateMediaSession() {
    if (!('mediaSession' in navigator)) return;
    var song = queue[currentIndex];
    if (!song) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.title || 'Unknown',
        artist: song.artist || 'ADTIFY',
        album: song.album || 'ADTIFY',
        artwork: [
          { src: coverOf(song), sizes: '96x96', type: 'image/jpeg' },
          { src: coverOf(song), sizes: '256x256', type: 'image/jpeg' },
          { src: coverOf(song), sizes: '512x512', type: 'image/jpeg' }
        ]
      });
    } catch (_) {}
    try {
      navigator.mediaSession.setActionHandler('play', function () { playerPlay(); setPlayingUI(true); startProgress(); });
      navigator.mediaSession.setActionHandler('pause', function () { playerPause(); setPlayingUI(false); stopProgress(); });
      navigator.mediaSession.setActionHandler('previoustrack', function () {
        if (currentIndex > 0) playTrack(queue, currentIndex - 1);
      });
      navigator.mediaSession.setActionHandler('nexttrack', function () {
        if (currentIndex < queue.length - 1) playTrack(queue, currentIndex + 1);
      });
      navigator.mediaSession.setActionHandler('seekto', function (d) {
        if (d.seekTime != null) playerSeek(d.seekTime);
      });
      navigator.mediaSession.setActionHandler('seekbackward', function () {
        playerSeek(Math.max(0, playerGetTime() - 10));
      });
      navigator.mediaSession.setActionHandler('seekforward', function () {
        playerSeek(playerGetTime() + 10);
      });
    } catch (_) {}
  }

  // Keep playing when tab hidden (audio mode survives; YT often does not)
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) return;
    // Returning to tab: resume UI state
    if (playerIsPlaying()) {
      setPlayingUI(true);
      startProgress();
    }
  });

  /* ========== Navigation ========== */
  function switchPage(page) {
    $$('.page').forEach(p => p.classList.remove('active'));
    const el = $('#page-' + page);
    if (el) el.classList.add('active');
    $$('.nav-btn, .mob-nav-btn').forEach(n => {
      n.classList.toggle('active', n.dataset.page === page);
    });
    if (page === 'library') renderLibrary();
    if (page === 'playlists') renderPlaylists();
    if (page === 'home' && !feedData) loadFeed();
  }
  $$('.nav-btn, .mob-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchPage(btn.dataset.page));
  });

  /* ========== Feed ========== */
  async function loadFeed() {
    const row = $('#feed-row');
    row.innerHTML = '<div class="skeleton-row"></div>';
    try {
      feedData = await request(LEHZZ + '/api/feed');
      renderFeed(currentSlot);
    } catch (e) {
      row.innerHTML = '<div class="empty-state"><p>Gagal memuat: ' + e.message + '</p></div>';
    }
  }
  function renderFeed(slot) {
    currentSlot = slot;
    $$('.pill').forEach(p => p.classList.toggle('active', p.dataset.slot === slot));
    const tracks = (feedData && feedData[slot]) || [];
    const row = $('#feed-row');
    if (!tracks.length) {
      row.innerHTML = '<div class="empty-state"><p>Kosong</p></div>';
      return;
    }
    row.innerHTML = tracks.map((t, i) => cardHTML(t, i)).join('');
    row.querySelectorAll('.song-card').forEach(card => {
      card.addEventListener('click', () => playTrack(tracks, +card.dataset.idx));
    });
  }
  $$('.pill').forEach(p => {
    p.addEventListener('click', () => { if (feedData) renderFeed(p.dataset.slot); });
  });

  function cardHTML(t, i) {
    return '<div class="song-card" data-idx="' + i + '">' +
      '<div class="art"><img src="' + coverOf(t) + '" alt="" loading="lazy" />' +
      '<button class="play-fab" tabindex="-1"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></button></div>' +
      '<div class="ct">' + esc(t.title) + '</div>' +
      '<div class="ca">' + esc(t.artist) + '</div></div>';
  }

  /* Chips & genres */
  function renderHomeExtras() {
    $('#artists-row').innerHTML = ARTS.map(a =>
      '<button class="chip" data-q="' + a + '">' + a + '</button>'
    ).join('');
    $('#artists-row').querySelectorAll('.chip').forEach(c => {
      c.addEventListener('click', () => { switchPage('search'); $('#search-input').value = c.dataset.q; doSearch(c.dataset.q); });
    });
    $('#genres-row').innerHTML = GENRES.map(g =>
      '<div class="genre-card" data-q="' + g + '">' + g + '</div>'
    ).join('');
    $('#genres-row').querySelectorAll('.genre-card').forEach(c => {
      c.addEventListener('click', () => { switchPage('search'); $('#search-input').value = c.dataset.q; doSearch(c.dataset.q); });
    });
  }

  /* Search */
  async function doSearch(q) {
    if (!q.trim()) return;
    const list = $('#search-results');
    list.innerHTML = '<div class="empty-state"><p>Mencari...</p></div>';
    try {
      const data = await request(LEHZZ + '/api/search', { q: q.trim() });
      const tracks = getTracks(data);
      if (!tracks.length) {
        list.innerHTML = '<div class="empty-state"><p>Tidak ditemukan</p></div>';
        return;
      }
      list.innerHTML = tracks.map((t, i) => rowHTML(t, i)).join('');
      bindRows(list, tracks);
    } catch (e) {
      list.innerHTML = '<div class="empty-state"><p>Error: ' + e.message + '</p></div>';
    }
  }
  $('#search-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') doSearch(e.target.value);
  });
  let searchDebounce;
  $('#search-input').addEventListener('input', e => {
    clearTimeout(searchDebounce);
    const v = e.target.value.trim();
    if (v.length >= 2) searchDebounce = setTimeout(() => doSearch(v), 450);
  });

  function rowHTML(t, i) {
    const dur = t.duration ? fmtTime(t.duration) : '';
    return '<div class="track-row" data-idx="' + i + '">' +
      '<span class="num">' + (i + 1) + '</span>' +
      '<img class="art" src="' + coverOf(t) + '" alt="" loading="lazy" />' +
      '<div class="meta"><div class="tt">' + esc(t.title) + '</div><div class="ta">' + esc(t.artist) + '</div></div>' +
      '<span class="dur">' + dur + '</span>' +
      '<div class="acts">' +
        '<button class="act-fav" data-idx="' + i + '" title="Favorit"><svg viewBox="0 0 24 24" fill="' + (isFav(t) ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg></button>' +
      '</div></div>';
  }
  function bindRows(container, tracks) {
    container.querySelectorAll('.track-row').forEach(row => {
      row.addEventListener('click', e => {
        if (e.target.closest('.acts')) return;
        playTrack(tracks, +row.dataset.idx);
      });
    });
    container.querySelectorAll('.act-fav').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        toggleFav(tracks[+btn.dataset.idx]);
        btn.querySelector('svg').setAttribute('fill', isFav(tracks[+btn.dataset.idx]) ? 'currentColor' : 'none');
      });
    });
  }

  /* Favorites / Library */
  function isFav(song) {
    return favorites.some(f => f.id === song.id || f.youtubeId === song.youtubeId);
  }
  function toggleFav(song) {
    const idx = favorites.findIndex(f => f.id === song.id || f.youtubeId === song.youtubeId);
    if (idx >= 0) { favorites.splice(idx, 1); toast('Dihapus dari favorit'); }
    else { favorites.push(song); toast('Ditambahkan ke favorit'); }
    saveJSON('adtify_favs', favorites);
    updateHeartUI();
    if ($('#page-library').classList.contains('active')) renderLibrary();
  }
  function updateHeartUI() {
    const song = queue[currentIndex];
    const on = song && isFav(song);
    ['#mini-fav', '#np-fav'].forEach(sel => {
      const btn = $(sel);
      if (!btn) return;
      btn.classList.toggle('active', !!on);
      const svg = btn.querySelector('svg');
      if (svg) svg.setAttribute('fill', on ? 'currentColor' : 'none');
    });
  }
  function pushRecent(song) {
    recent = recent.filter(r => r.id !== song.id && r.youtubeId !== song.youtubeId);
    recent.unshift(song);
    if (recent.length > 50) recent = recent.slice(0, 50);
    saveJSON('adtify_recent', recent);
  }
  function renderLibrary() {
    const list = libTab === 'favs' ? favorites : recent;
    const el = $('#library-list');
    if (!list.length) {
      el.innerHTML = '<div class="empty-state"><p>' + (libTab === 'favs' ? 'Belum ada favorit' : 'Belum ada riwayat') + '</p></div>';
      return;
    }
    el.innerHTML = list.map((t, i) => rowHTML(t, i)).join('');
    bindRows(el, list);
  }
  $$('.lib-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      libTab = tab.dataset.lib;
      $$('.lib-tab').forEach(t => t.classList.toggle('active', t.dataset.lib === libTab));
      renderLibrary();
    });
  });

  /* Public playlists */
  function renderPlaylists() {
    $('#playlist-tracks').style.display = 'none';
    const grid = $('#playlist-grid');
    grid.style.display = 'grid';
    grid.innerHTML = PUBLIC_PLAYLISTS.map(pl =>
      '<div class="pl-card" data-id="' + pl.id + '">' +
        '<div class="pl-cover" style="background:' + pl.color + '">' + pl.emoji + '</div>' +
        '<h3>' + esc(pl.name) + '</h3>' +
        '<p>' + esc(pl.desc) + '</p></div>'
    ).join('');
    grid.querySelectorAll('.pl-card').forEach(card => {
      card.addEventListener('click', () => openPlaylist(card.dataset.id));
    });
  }
  async function openPlaylist(id) {
    const pl = PUBLIC_PLAYLISTS.find(p => p.id === id);
    if (!pl) return;
    $('#playlist-grid').style.display = 'none';
    const list = $('#playlist-tracks');
    list.style.display = 'flex';
    list.innerHTML = '<div class="empty-state"><p>Memuat ' + esc(pl.name) + '...</p></div>';
    try {
      const data = await request(LEHZZ + '/api/search', { q: pl.query });
      const tracks = getTracks(data);
      if (!tracks.length) {
        list.innerHTML = '<div class="empty-state"><p>Kosong</p></div>';
        return;
      }
      list.innerHTML = '<button class="pill" id="pl-back" style="margin-bottom:16px;align-self:flex-start">← Kembali</button>' +
        tracks.map((t, i) => rowHTML(t, i)).join('');
      $('#pl-back').addEventListener('click', renderPlaylists);
      bindRows(list, tracks);
    } catch (e) {
      list.innerHTML = '<div class="empty-state"><p>Error: ' + e.message + '</p></div>';
    }
  }

  /* ========== PLAY ========== */
  async function resolveStreamUrl(song) {
    var ytId = getYtId(song);
    if (!ytId) return null;
    if (streamCache[ytId]) return streamCache[ytId];
    var url = 'https://www.youtube.com/watch?v=' + ytId;
    try {
      var data = await request(FUKU, { api: API_KEY, url: url });
      if (data.status && data.result && data.result.download) {
        streamCache[ytId] = data.result.download;
        return data.result.download;
      }
    } catch (e) {
      console.warn('stream resolve failed', e);
    }
    return null;
  }

  function playViaYoutube(song) {
    var ytId = getYtId(song);
    if (!ytId) { toast('ID YouTube tidak ada'); return; }
    playMode = 'youtube';
    if (audioEl) { try { audioEl.pause(); audioEl.removeAttribute('src'); } catch (_) {} }
    function tryPlay() {
      if (!ytPlayer || !ytReady) { setTimeout(tryPlay, 200); return; }
      try {
        ytPlayer.loadVideoById({ videoId: ytId, startSeconds: 0 });
        ytPlayer.playVideo();
        setPlayingUI(true);
        startProgress();
        toast('Mode preview (bisa terhenti di background)');
      } catch (err) {
        console.error(err);
        toast('Gagal memutar');
      }
    }
    tryPlay();
  }

  async function playViaAudio(song) {
    toast('Menyiapkan audio...');
    var stream = await resolveStreamUrl(song);
    if (!stream) {
      playViaYoutube(song);
      return;
    }
    playMode = 'audio';
    try {
      if (ytPlayer && ytReady) { try { ytPlayer.stopVideo(); } catch (_) {} }
    } catch (_) {}
    audioEl.src = stream;
    audioEl.load();
    try {
      await audioEl.play();
      setPlayingUI(true);
      startProgress();
      toast('Siap — bisa diputar di background');
    } catch (err) {
      console.warn(err);
      // autoplay blocked — still set src, user can press play
      setPlayingUI(false);
      toast('Ketuk tombol play untuk mulai');
    }
  }

  function playTrack(tracks, index) {
    queue = tracks;
    currentIndex = index;
    var song = queue[index];
    if (!song) return;
    var ytId = getYtId(song);
    if (!ytId) { toast('ID YouTube tidak ada'); return; }

    var cover = coverOf(song);
    document.getElementById('mini-art').src = cover;
    document.getElementById('mini-title').textContent = song.title || 'Unknown';
    document.getElementById('mini-artist').textContent = song.artist || '—';
    document.getElementById('np-art').src = cover;
    document.getElementById('np-title').textContent = song.title || 'Unknown';
    document.getElementById('np-artist').textContent = song.artist || '—';
    document.getElementById('np-from').textContent = song.album || 'ADTIFY';
    document.getElementById('np-bg').style.backgroundImage = 'url(' + cover + ')';
    songDuration = song.duration || 0;
    document.getElementById('np-dur').textContent = fmtTime(songDuration);
    document.getElementById('np-cur').textContent = '0:00';
    document.getElementById('mini-fill').style.width = '0%';
    document.getElementById('np-bar-fill').style.width = '0%';
    updateHeartUI();
    pushRecent(song);
    loadLyrics(song);
    updateMediaSession();

    document.querySelectorAll('.track-row').forEach(function (r) { r.classList.remove('playing'); });
    document.querySelectorAll('[data-idx="' + index + '"]').forEach(function (el) {
      if (el.classList.contains('track-row')) el.classList.add('playing');
    });

    // Prefer HTML5 audio stream for true background playback
    playViaAudio(song);
  }

    function togglePlay() {
    if (currentIndex < 0) {
      if (queue.length) playTrack(queue, Math.max(0, currentIndex));
      return;
    }
    if (playMode === 'none') {
      if (queue[currentIndex]) playTrack(queue, currentIndex);
      return;
    }
    if (playerIsPlaying()) {
      playerPause();
      setPlayingUI(false);
      stopProgress();
    } else {
      playerPlay();
      setPlayingUI(true);
      startProgress();
    }
  }

  $('#mini-play').addEventListener('click', e => { e.stopPropagation(); togglePlay(); });
  $('#np-play').addEventListener('click', togglePlay);
  $('#np-prev').addEventListener('click', () => {
    if (currentIndex > 0) playTrack(queue, currentIndex - 1);
  });
  $('#np-next').addEventListener('click', () => {
    if (currentIndex < queue.length - 1) playTrack(queue, currentIndex + 1);
  });
  $('#np-shuffle').addEventListener('click', () => {
    shuffleOn = !shuffleOn;
    $('#np-shuffle').classList.toggle('active', shuffleOn);
    toast(shuffleOn ? 'Shuffle on' : 'Shuffle off');
  });
  $('#np-repeat').addEventListener('click', () => {
    repeatOn = !repeatOn;
    $('#np-repeat').classList.toggle('active', repeatOn);
    toast(repeatOn ? 'Repeat on' : 'Repeat off');
  });

  /* Open / close Now Playing */
  function openNP() {
    if (currentIndex < 0) { toast('Pilih lagu dulu'); return; }
    $('#now-playing').classList.add('open');
  }
  function closeNP() { $('#now-playing').classList.remove('open'); }

  $('#mini-body').addEventListener('click', e => {
    if (e.target.closest('.mini-btn')) return;
    openNP();
  });
  $('#btn-open-np').addEventListener('click', openNP);
  $('#np-close').addEventListener('click', closeNP);

  /* Seek */
  function seekBar(e, bar) {
    var d = playerGetDuration();
    if (!d) return;
    try {
      var rect = bar.getBoundingClientRect();
      var pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      playerSeek(pct * d);
      document.getElementById('np-bar-fill').style.width = (pct * 100) + '%';
      document.getElementById('np-bar-knob').style.left = (pct * 100) + '%';
      document.getElementById('mini-fill').style.width = (pct * 100) + '%';
    } catch (_) {}
  }
  $('#np-bar').addEventListener('click', e => seekBar(e, e.currentTarget));

  /* Fav / Download from NP */
  $('#mini-fav').addEventListener('click', e => {
    e.stopPropagation();
    if (queue[currentIndex]) toggleFav(queue[currentIndex]);
  });
  $('#np-fav').addEventListener('click', () => {
    if (queue[currentIndex]) toggleFav(queue[currentIndex]);
  });
  $('#np-download').addEventListener('click', () => {
    if (queue[currentIndex]) downloadTrack(queue[currentIndex]);
  });

  async function downloadTrack(song) {
    const ytId = getYtId(song);
    const url = ytId ? 'https://www.youtube.com/watch?v=' + ytId : song.audioUrl;
    if (!url) { toast('URL tidak ada'); return; }
    toast('Memproses download...');
    try {
      const data = await request(FUKU, { api: API_KEY, url });
      if (!data.status || !(data.result && data.result.download)) {
        toast(data.message || 'Gagal download');
        return;
      }
      const a = document.createElement('a');
      a.href = data.result.download;
      a.download = (data.result.filename || song.title || 'audio') + '.mp3';
      a.target = '_blank';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast('Download dimulai');
    } catch (e) {
      toast('Error: ' + e.message);
    }
  }

  /* Lyrics */
  async function loadLyrics(song) {
    syncedLyrics = [];
    const body = $('#ls-body');
    body.innerHTML = '<div class="ls-loading">Memuat lirik...</div>';
    let text = song.lyrics || null;
    if (!text) {
      try {
        const data = await request(LEHZZ + '/api/lyrics', {
          track: song.title,
          artist: song.artist,
          duration: Math.round(song.duration || 0)
        });
        text = data.syncedLyrics || data.plainLyrics || null;
      } catch (_) {}
    }
    if (!text) {
      body.innerHTML = '<div class="ls-loading">Lirik tidak ditemukan</div>';
      return;
    }
    const lines = text.split('\n').filter(Boolean);
    const parsed = [];
    const re = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\](.*)/;
    lines.forEach(line => {
      const m = line.match(re);
      if (m) {
        const t = parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + (m[3] ? parseInt(m[3].padEnd(3, '0').slice(0, 3), 10) / 1000 : 0);
        const c = m[4].trim();
        if (c) parsed.push({ time: t, text: c });
      } else if (line.trim() && line[0] !== '[') {
        parsed.push({ time: -1, text: line.trim() });
      }
    });
    if (parsed.some(p => p.time >= 0)) {
      syncedLyrics = parsed.filter(p => p.time >= 0);
      body.innerHTML = syncedLyrics.map((l, i) =>
        '<div class="ls-line" data-t="' + l.time + '">' + esc(l.text) + '</div>'
      ).join('');
      body.querySelectorAll('.ls-line').forEach(el => {
        el.addEventListener('click', () => {
          const t = parseFloat(el.dataset.t);
          if (!isNaN(t)) playerSeek(t);
        });
      });
    } else {
      body.innerHTML = lines.map(l =>
        '<div class="ls-line">' + esc(l.replace(/\[\d+:\d+(?:\.\d+)?\]/g, '').trim()) + '</div>'
      ).filter(h => h.length > 30).join('') || '<div class="ls-loading">' + esc(text) + '</div>';
    }
  }
  function updateSyncedLyrics(t) {
    if (!syncedLyrics.length) return;
    let active = -1;
    for (let i = 0; i < syncedLyrics.length; i++) {
      if (syncedLyrics[i].time <= t + 0.25) active = i;
      else break;
    }
    const lines = $('#ls-body').querySelectorAll('.ls-line');
    lines.forEach((el, i) => {
      const was = el.classList.contains('active');
      el.classList.toggle('active', i === active);
      if (i === active && !was) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
  $('#np-lyrics').addEventListener('click', () => {
    if (currentIndex < 0) { toast('Pilih lagu dulu'); return; }
    $('#lyrics-sheet').classList.add('open');
  });
  $('#ls-close').addEventListener('click', () => $('#lyrics-sheet').classList.remove('open'));

  /* Init */
  setGreeting();
  renderHomeExtras();
  loadFeed();
  switchPage('home');

  // PWA service worker — membantu audio tetap hidup di Android
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(function () {});
  }
})();

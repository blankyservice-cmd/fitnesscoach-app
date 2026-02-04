(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════
     CONSTANTS
     ═══════════════════════════════════════════════════════ */

  const API_URL = '/api/chat';
  const STORAGE_KEY = 'fitness-coach-data';
  const MAX_MESSAGES = 200;
  const API_TIMEOUT = 30000;

  const XP_PER_MESSAGE = 15;
  const XP_FIRST_MESSAGE_BONUS = 25;
  const XP_STREAK_BONUS = 5;

  const LEVELS = [
    { level: 1,  name: 'Newcomer',      xp: 0 },
    { level: 2,  name: 'Warm-Up',       xp: 100 },
    { level: 3,  name: 'Spotter',       xp: 250 },
    { level: 4,  name: 'Rep Counter',   xp: 500 },
    { level: 5,  name: 'Iron Regular',  xp: 850 },
    { level: 6,  name: 'Plate Loader',  xp: 1300 },
    { level: 7,  name: 'PR Chaser',     xp: 1900 },
    { level: 8,  name: 'Gym Rat',       xp: 2700 },
    { level: 9,  name: 'Beast Mode',    xp: 3800 },
    { level: 10, name: 'Iron Legend',    xp: 5200 },
  ];

  const ACHIEVEMENTS = [
    {
      id: 'first-rep',
      name: 'First Rep',
      icon: '\u{1F4AA}',
      desc: 'Every journey starts with one rep',
      color: 'green',
      check: (s) => s.stats.totalMessages >= 1,
    },
    {
      id: 'warm-up-complete',
      name: 'Warm-Up Complete',
      icon: '\u{1F525}',
      desc: 'You\'re warmed up and ready',
      color: 'warm',
      check: (s) => s.stats.totalMessages >= 10,
    },
    {
      id: 'consistency-king',
      name: 'Consistency King',
      icon: '\u{1F451}',
      desc: 'Three days straight \u2014 habit forming',
      color: 'warm',
      check: (s) => s.streak.current >= 3 || s.streak.longest >= 3,
    },
    {
      id: 'knowledge-hungry',
      name: 'Knowledge Hungry',
      icon: '\u{1F4D6}',
      desc: 'A student of the iron game',
      color: 'green',
      check: (s) => s.stats.totalMessages >= 25,
    },
    {
      id: 'week-warrior',
      name: 'Week Warrior',
      icon: '\u{1F6E1}\uFE0F',
      desc: 'A full week of dedication',
      color: 'warm',
      check: (s) => s.streak.current >= 7 || s.streak.longest >= 7,
    },
    {
      id: 'century-club',
      name: 'Century Club',
      icon: '\u{1F4AF}',
      desc: '100 conversations with your coach',
      color: 'green',
      check: (s) => s.stats.totalMessages >= 100,
    },
    {
      id: 'early-bird',
      name: 'Early Bird',
      icon: '\u{1F305}',
      desc: 'The early bird gets the gains',
      color: 'warm',
      check: (s) => s._earlyBird === true,
    },
    {
      id: 'night-owl',
      name: 'Night Owl',
      icon: '\u{1F319}',
      desc: 'Burning the midnight oil for fitness',
      color: 'info',
      check: (s) => s._nightOwl === true,
    },
    {
      id: 'topic-explorer',
      name: 'Topic Explorer',
      icon: '\u{1F9ED}',
      desc: 'Well-rounded athlete',
      color: 'green',
      check: (s) => {
        const t = s.topicsExplored;
        return t.lifting && t.yoga && t.mobility && t.nutrition;
      },
    },
    {
      id: 'streak-legend',
      name: 'Streak Legend',
      icon: '\u{1F525}\u{1F525}',
      desc: 'A month of discipline',
      color: 'warm',
      check: (s) => s.streak.current >= 30 || s.streak.longest >= 30,
    },
    {
      id: 'iron-veteran',
      name: 'Iron Veteran',
      icon: '\u{1F3CB}\uFE0F',
      desc: 'A seasoned gym-goer',
      color: 'green',
      check: (s) => s.xp.level >= 5,
    },
    {
      id: 'legend-status',
      name: 'Legend Status',
      icon: '\u{1F3C6}',
      desc: 'You\'ve reached the pinnacle',
      color: 'warm',
      check: (s) => s.xp.level >= 10,
    },
  ];

  const TOPIC_KEYWORDS = {
    lifting: ['bench', 'squat', 'deadlift', 'press', 'curl', 'hypertrophy', 'strength', 'reps', 'sets', 'weightlifting', 'barbell', 'dumbbell', 'pull', 'push', 'row', 'compound', 'isolation', 'muscle', 'weight', 'lift'],
    yoga: ['yoga', 'pose', 'asana', 'vinyasa', 'downward dog', 'warrior', 'flexibility', 'flow', 'sun salutation', 'pigeon', 'child\'s pose'],
    mobility: ['mobility', 'stretch', 'foam roll', 'warm up', 'warmup', 'cooldown', 'cool down', 'range of motion', 'tight', 'stiff', 'joint', 'hip opener', 'shoulder mobility'],
    nutrition: ['protein', 'calories', 'meal', 'diet', 'macros', 'carbs', 'fat', 'supplement', 'creatine', 'food', 'eat', 'nutrition', 'calorie', 'bulk', 'cut', 'deficit', 'surplus'],
  };

  /* ═══════════════════════════════════════════════════════
     DEFAULT STATE
     ═══════════════════════════════════════════════════════ */

  function defaultStore() {
    const achievements = {};
    ACHIEVEMENTS.forEach((a) => {
      achievements[a.id] = { unlocked: false, unlockedAt: null };
    });
    return {
      schemaVersion: 1,
      sessionId: null,
      messages: [],
      xp: { total: 0, level: 1, todayMessageCount: 0, lastXpDate: '' },
      streak: { current: 0, longest: 0, lastActiveDate: '', weekActivity: {} },
      achievements: achievements,
      topicsExplored: { lifting: false, yoga: false, mobility: false, nutrition: false },
      stats: { totalMessages: 0, firstMessageDate: null },
    };
  }

  /* ═══════════════════════════════════════════════════════
     STATE & DOM
     ═══════════════════════════════════════════════════════ */

  let store = defaultStore();
  let isWaiting = false;
  let lastFailedMessage = null;
  let userHasScrolled = false;

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const el = {};

  function cacheDom() {
    el.chatMessages = $('#chat-messages');
    el.chatInput = $('#chat-input');
    el.chatSend = $('#chat-send');
    el.starterArea = $('#starter-area');
    el.scrollBottom = $('#scroll-bottom');
    el.sidebar = $('#sidebar');
    el.sidebarToggle = $('#sidebar-toggle');
    el.sidebarBackdrop = $('#sidebar-backdrop');
    el.headerStreak = $('#header-streak-num');
    el.headerLevel = $('#header-level-num');
    el.sidebarLevelNum = $('#sidebar-level-num');
    el.sidebarRankName = $('#sidebar-rank-name');
    el.xpBarFill = $('#xp-bar-fill');
    el.xpBar = $('#xp-bar');
    el.xpCurrent = $('#xp-current');
    el.xpTarget = $('#xp-target');
    el.levelCard = $('#level-card');
    el.streakFlame = $('#streak-flame');
    el.streakNumber = $('#streak-number');
    el.streakBest = $('#streak-best');
    el.streakWeek = $('#streak-week');
    el.statMessages = $('#stat-messages');
    el.statTopics = $('#stat-topics');
    el.statSince = $('#stat-since');
    el.badgeCount = $('#badge-count');
    el.badgeGrid = $('#badge-grid');
    el.levelupOverlay = $('#levelup-overlay');
    el.levelupParticles = $('#levelup-particles');
    el.levelupRank = $('#levelup-rank');
    el.levelupLevel = $('#levelup-level');
    el.toastContainer = $('#toast-container');
    el.resetBtn = $('#reset-btn');
    el.resetModal = $('#reset-modal');
    el.resetCancel = $('#reset-cancel');
    el.resetConfirm = $('#reset-confirm');
    el.badgeTooltip = $('#badge-tooltip');
    el.tooltipName = $('#tooltip-name');
    el.tooltipDesc = $('#tooltip-desc');
    el.tooltipDate = $('#tooltip-date');
  }

  /* ═══════════════════════════════════════════════════════
     LOCAL STORAGE
     ═══════════════════════════════════════════════════════ */

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return;
      if (data.schemaVersion !== 1) return; // future migration hook
      // Merge with defaults to handle missing keys
      const def = defaultStore();
      store = {
        ...def,
        ...data,
        xp: { ...def.xp, ...data.xp },
        streak: { ...def.streak, ...data.streak },
        achievements: { ...def.achievements, ...data.achievements },
        topicsExplored: { ...def.topicsExplored, ...data.topicsExplored },
        stats: { ...def.stats, ...data.stats },
      };
    } catch {
      store = defaultStore();
    }
  }

  function saveStore() {
    try {
      // Cap messages
      if (store.messages.length > MAX_MESSAGES) {
        store.messages = store.messages.slice(-MAX_MESSAGES);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {
      // Storage full — silently fail
    }
  }

  /* ═══════════════════════════════════════════════════════
     SESSION ID
     ═══════════════════════════════════════════════════════ */

  function getOrCreateSessionId() {
    if (store.sessionId) return store.sessionId;
    const random = Math.random().toString(36).substring(2, 10);
    const ts = Date.now();
    store.sessionId = 'fc-' + random + '-' + ts;
    saveStore();
    return store.sessionId;
  }

  /* ═══════════════════════════════════════════════════════
     DATE HELPERS
     ═══════════════════════════════════════════════════════ */

  function getLocalDateStr(date) {
    const d = date || new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return getLocalDateStr(d);
  }

  function getWeekDates() {
    const now = new Date();
    const day = now.getDay(); // 0=Sun
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((day + 6) % 7));
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      dates.push(getLocalDateStr(d));
    }
    return dates;
  }

  function formatTimestamp(ts) {
    const d = new Date(ts);
    const h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hr = h % 12 || 12;
    return hr + ':' + m + ' ' + ampm;
  }

  function formatDate(ts) {
    if (!ts) return 'Today';
    const d = new Date(ts);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[d.getMonth()] + ' ' + d.getDate();
  }

  /* ═══════════════════════════════════════════════════════
     MARKDOWN PARSER (Lightweight, XSS-safe)
     ═══════════════════════════════════════════════════════ */

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function parseMarkdown(text) {
    if (!text) return '';
    let html = escapeHtml(text);

    // Code blocks (triple backtick)
    html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, function (_, lang, code) {
      return '<pre><code>' + code.trim() + '</code></pre>';
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Headers
    html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');

    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');

    // Italic
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

    // Unordered lists
    html = html.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

    // Ordered lists
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
    // Wrap consecutive <li> that aren't already in <ul>
    html = html.replace(/(?:^|(?<=<\/ul>))(<li>(?:[\s\S]*?)<\/li>(?:\n<li>(?:[\s\S]*?)<\/li>)*)/gm, function (match) {
      if (match.indexOf('<ul>') === -1) return '<ol>' + match + '</ol>';
      return match;
    });

    // Paragraphs — split on double newlines
    const blocks = html.split(/\n{2,}/);
    html = blocks.map(function (block) {
      block = block.trim();
      if (!block) return '';
      if (block.startsWith('<h') || block.startsWith('<ul') || block.startsWith('<ol') || block.startsWith('<pre') || block.startsWith('<li')) {
        return block;
      }
      // Convert single newlines to <br> within paragraphs
      return '<p>' + block.replace(/\n/g, '<br>') + '</p>';
    }).join('');

    return html;
  }

  /* ═══════════════════════════════════════════════════════
     CHAT RENDERING
     ═══════════════════════════════════════════════════════ */

  function createMessageEl(msg) {
    const div = document.createElement('div');
    div.className = 'message message--' + msg.role;
    div.setAttribute('role', 'listitem');

    const bubble = document.createElement('div');
    bubble.className = 'message__bubble';

    if (msg.role === 'assistant') {
      bubble.innerHTML = parseMarkdown(msg.content);
    } else if (msg.role === 'error') {
      bubble.innerHTML = escapeHtml(msg.content);
      const retryBtn = document.createElement('button');
      retryBtn.className = 'message__retry';
      retryBtn.textContent = 'Retry';
      retryBtn.addEventListener('click', function () {
        retryLastMessage();
      });
      bubble.appendChild(retryBtn);
    } else {
      bubble.textContent = msg.content;
    }

    const time = document.createElement('div');
    time.className = 'message__time';
    time.textContent = formatTimestamp(msg.timestamp);

    div.appendChild(bubble);
    div.appendChild(time);
    return div;
  }

  function appendMessage(msg, save) {
    if (save !== false) {
      store.messages.push(msg);
      saveStore();
    }

    // Hide starter if present
    if (el.starterArea && !el.starterArea.classList.contains('hidden')) {
      el.starterArea.classList.add('hidden');
    }

    const msgEl = createMessageEl(msg);
    el.chatMessages.appendChild(msgEl);
    autoScroll();
  }

  function renderChatHistory() {
    // Clear existing
    el.chatMessages.innerHTML = '';

    if (store.messages.length === 0) {
      // Re-add starter
      el.chatMessages.appendChild(el.starterArea);
      el.starterArea.classList.remove('hidden');
      return;
    }

    // Hide starter
    if (el.starterArea.parentNode === el.chatMessages) {
      el.chatMessages.removeChild(el.starterArea);
    }

    const frag = document.createDocumentFragment();
    store.messages.forEach(function (msg) {
      const msgEl = createMessageEl(msg);
      msgEl.style.animation = 'none'; // No animation for history
      frag.appendChild(msgEl);
    });
    el.chatMessages.appendChild(frag);

    // Scroll to bottom after render
    requestAnimationFrame(function () {
      el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
    });
  }

  /* ─── Typing Indicator ─── */
  let typingEl = null;

  function showTyping() {
    if (typingEl) return;
    typingEl = document.createElement('div');
    typingEl.className = 'typing';
    typingEl.setAttribute('aria-label', 'Coach is typing');
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('div');
      dot.className = 'typing__dot';
      typingEl.appendChild(dot);
    }
    el.chatMessages.appendChild(typingEl);
    autoScroll();
  }

  function hideTyping() {
    if (typingEl && typingEl.parentNode) {
      typingEl.parentNode.removeChild(typingEl);
    }
    typingEl = null;
  }

  /* ─── Auto-scroll ─── */
  function autoScroll() {
    if (!userHasScrolled) {
      requestAnimationFrame(function () {
        el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
      });
    }
  }

  function checkScroll() {
    const m = el.chatMessages;
    const atBottom = m.scrollTop + m.clientHeight >= m.scrollHeight - 80;
    userHasScrolled = !atBottom;
    el.scrollBottom.hidden = atBottom;
  }

  function scrollToBottom() {
    userHasScrolled = false;
    el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
    el.scrollBottom.hidden = true;
  }

  /* ═══════════════════════════════════════════════════════
     API
     ═══════════════════════════════════════════════════════ */

  function extractAIResponse(data) {
    if (typeof data === 'string') return data;
    if (data && data.output) return data.output;
    if (data && data.text) return data.text;
    if (data && data.response) return data.response;
    if (data && data.message) return data.message;
    if (Array.isArray(data) && data.length > 0) return extractAIResponse(data[0]);
    if (data && typeof data === 'object') {
      // Try to find the first string value
      const vals = Object.values(data);
      for (const v of vals) {
        if (typeof v === 'string' && v.length > 0) return v;
      }
    }
    return JSON.stringify(data);
  }

  async function sendToAPI(userMessage) {
    const sessionId = getOrCreateSessionId();
    const controller = new AbortController();
    const timeoutId = setTimeout(function () { controller.abort(); }, API_TIMEOUT);

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatInput: userMessage, sessionId: sessionId }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error('Server error: ' + response.status);
      }

      const data = await response.json();
      return extractAIResponse(data);
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error('Response is taking too long. Please try again.');
      }
      if (err.message.startsWith('Server error')) {
        throw new Error('Something went wrong on our end. Please try again.');
      }
      throw new Error('Unable to reach the coach. Check your connection and try again.');
    }
  }

  /* ═══════════════════════════════════════════════════════
     SEND MESSAGE
     ═══════════════════════════════════════════════════════ */

  async function sendMessage(text) {
    if (!text.trim() || isWaiting) return;
    const content = text.trim();
    isWaiting = true;
    lastFailedMessage = content;
    setInputEnabled(false);

    // Add user message
    const userMsg = {
      id: 'msg-' + Date.now(),
      role: 'user',
      content: content,
      timestamp: Date.now(),
    };
    appendMessage(userMsg);

    // Update gamification (XP is optimistic, on send)
    updateGamificationOnSend(content);

    // Show typing
    showTyping();

    try {
      const response = await sendToAPI(content);
      hideTyping();

      const aiMsg = {
        id: 'msg-' + Date.now(),
        role: 'assistant',
        content: response,
        timestamp: Date.now(),
      };
      appendMessage(aiMsg);
      lastFailedMessage = null;
    } catch (err) {
      hideTyping();
      const errMsg = {
        id: 'msg-err-' + Date.now(),
        role: 'error',
        content: err.message,
        timestamp: Date.now(),
      };
      appendMessage(errMsg, false); // Don't persist error messages
    }

    isWaiting = false;
    setInputEnabled(true);
    el.chatInput.focus();
  }

  function retryLastMessage() {
    if (!lastFailedMessage || isWaiting) return;
    // Remove error message from DOM
    const errors = el.chatMessages.querySelectorAll('.message--error');
    errors.forEach(function (e) { e.remove(); });
    sendMessage(lastFailedMessage);
  }

  function setInputEnabled(enabled) {
    el.chatInput.disabled = !enabled;
    el.chatSend.disabled = !enabled || !el.chatInput.value.trim();
    if (enabled) {
      el.chatInput.focus();
    }
  }

  /* ═══════════════════════════════════════════════════════
     INPUT HANDLING
     ═══════════════════════════════════════════════════════ */

  function setupInput() {
    el.chatInput.addEventListener('input', function () {
      autoGrowTextarea();
      el.chatSend.disabled = isWaiting || !el.chatInput.value.trim();
    });

    el.chatInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!isWaiting && el.chatInput.value.trim()) {
          const text = el.chatInput.value;
          el.chatInput.value = '';
          autoGrowTextarea();
          el.chatSend.disabled = true;
          sendMessage(text);
        }
      }
    });

    el.chatSend.addEventListener('click', function () {
      if (!isWaiting && el.chatInput.value.trim()) {
        const text = el.chatInput.value;
        el.chatInput.value = '';
        autoGrowTextarea();
        el.chatSend.disabled = true;
        sendMessage(text);
      }
    });

    el.scrollBottom.addEventListener('click', scrollToBottom);
    el.chatMessages.addEventListener('scroll', checkScroll);
  }

  function autoGrowTextarea() {
    el.chatInput.style.height = 'auto';
    el.chatInput.style.height = Math.min(el.chatInput.scrollHeight, 120) + 'px';
  }

  function setupStarterPrompts() {
    const cards = $$('.starter__card');
    cards.forEach(function (card) {
      card.addEventListener('click', function () {
        const prompt = card.getAttribute('data-prompt');
        if (prompt) {
          el.chatInput.value = '';
          sendMessage(prompt);
        }
      });
    });
  }

  /* ═══════════════════════════════════════════════════════
     GAMIFICATION — XP & LEVELS
     ═══════════════════════════════════════════════════════ */

  function calculateLevel(xp) {
    let lvl = LEVELS[0];
    for (let i = LEVELS.length - 1; i >= 0; i--) {
      if (xp >= LEVELS[i].xp) {
        lvl = LEVELS[i];
        break;
      }
    }
    return lvl;
  }

  function getNextLevel(currentLevel) {
    const idx = LEVELS.findIndex(function (l) { return l.level === currentLevel; });
    if (idx < LEVELS.length - 1) return LEVELS[idx + 1];
    return null;
  }

  function addXP() {
    const today = getLocalDateStr();
    let amount = XP_PER_MESSAGE;

    // First message of day bonus
    if (store.xp.lastXpDate !== today) {
      amount += XP_FIRST_MESSAGE_BONUS;
      store.xp.todayMessageCount = 0;
    }

    // Streak bonus
    if (store.streak.current >= 3) {
      amount += XP_STREAK_BONUS;
    }

    store.xp.todayMessageCount += 1;
    store.xp.lastXpDate = today;

    const oldLevel = store.xp.level;
    store.xp.total += amount;

    const newLevelInfo = calculateLevel(store.xp.total);
    store.xp.level = newLevelInfo.level;

    saveStore();

    // Check for level up
    if (newLevelInfo.level > oldLevel) {
      // Delay to let XP bar animate first
      setTimeout(function () {
        showLevelUpAnimation(newLevelInfo);
      }, 500);
    }
  }

  /* ═══════════════════════════════════════════════════════
     GAMIFICATION — STREAKS
     ═══════════════════════════════════════════════════════ */

  function updateStreak() {
    const today = getLocalDateStr();
    if (store.streak.lastActiveDate === today) return; // Already active today

    const yesterday = daysAgo(1);
    const twoDaysAgo = daysAgo(2);

    if (store.streak.lastActiveDate === yesterday) {
      store.streak.current += 1;
    } else if (store.streak.lastActiveDate === twoDaysAgo) {
      // Grace period — preserve but don't increment
      // Keep current streak
    } else if (store.streak.lastActiveDate === '') {
      // First time ever
      store.streak.current = 1;
    } else {
      store.streak.current = 1;
    }

    store.streak.lastActiveDate = today;
    store.streak.longest = Math.max(store.streak.longest, store.streak.current);

    // Update week activity
    store.streak.weekActivity[today] = true;

    saveStore();
  }

  /* ═══════════════════════════════════════════════════════
     GAMIFICATION — ACHIEVEMENTS
     ═══════════════════════════════════════════════════════ */

  function detectTopics(text) {
    const lower = text.toLowerCase();
    let changed = false;
    Object.keys(TOPIC_KEYWORDS).forEach(function (topic) {
      if (!store.topicsExplored[topic]) {
        const found = TOPIC_KEYWORDS[topic].some(function (kw) {
          return lower.includes(kw);
        });
        if (found) {
          store.topicsExplored[topic] = true;
          changed = true;
        }
      }
    });
    if (changed) saveStore();
  }

  function checkAchievements() {
    // Temporary flags for time-based achievements
    const hour = new Date().getHours();
    store._earlyBird = store._earlyBird || hour < 7;
    store._nightOwl = store._nightOwl || hour >= 22;

    const newlyUnlocked = [];

    ACHIEVEMENTS.forEach(function (a) {
      if (store.achievements[a.id] && store.achievements[a.id].unlocked) return;
      if (a.check(store)) {
        store.achievements[a.id] = { unlocked: true, unlockedAt: Date.now() };
        newlyUnlocked.push(a);
      }
    });

    // Clean up temp flags — persist early bird / night owl
    if (store._earlyBird) {
      if (!store._persistedEarlyBird) {
        store._persistedEarlyBird = true;
        saveStore();
      }
    }
    if (store._nightOwl) {
      if (!store._persistedNightOwl) {
        store._persistedNightOwl = true;
        saveStore();
      }
    }
    // Reload persisted flags
    store._earlyBird = store._earlyBird || store._persistedEarlyBird || false;
    store._nightOwl = store._nightOwl || store._persistedNightOwl || false;

    if (newlyUnlocked.length > 0) {
      saveStore();
      newlyUnlocked.forEach(function (a, i) {
        setTimeout(function () {
          showAchievementToast(a);
          markBadgeUnlocked(a.id);
        }, i * 800); // Stagger toasts
      });
    }
  }

  /* ═══════════════════════════════════════════════════════
     GAMIFICATION — COMBINED UPDATE
     ═══════════════════════════════════════════════════════ */

  function updateGamificationOnSend(messageText) {
    store.stats.totalMessages += 1;
    if (!store.stats.firstMessageDate) {
      store.stats.firstMessageDate = Date.now();
    }

    detectTopics(messageText);
    updateStreak();
    addXP();
    checkAchievements();
    renderSidebar();
  }

  /* ═══════════════════════════════════════════════════════
     SIDEBAR RENDERING
     ═══════════════════════════════════════════════════════ */

  function renderSidebar() {
    const lvl = calculateLevel(store.xp.total);
    const next = getNextLevel(lvl.level);

    // Header indicators
    el.headerStreak.textContent = store.streak.current;
    el.headerLevel.textContent = lvl.level;

    // Level card
    el.sidebarLevelNum.textContent = lvl.level;
    el.sidebarRankName.textContent = lvl.name;

    if (next) {
      const progress = ((store.xp.total - lvl.xp) / (next.xp - lvl.xp)) * 100;
      el.xpBarFill.style.width = Math.min(progress, 100) + '%';
      el.xpBar.setAttribute('aria-valuenow', Math.round(progress));
      el.xpCurrent.textContent = store.xp.total.toLocaleString();
      el.xpTarget.textContent = next.xp.toLocaleString();
    } else {
      el.xpBarFill.style.width = '100%';
      el.xpBar.setAttribute('aria-valuenow', 100);
      el.xpCurrent.textContent = store.xp.total.toLocaleString();
      el.xpTarget.textContent = 'MAX';
    }

    // Streak card
    el.streakNumber.textContent = store.streak.current;
    el.streakBest.textContent = 'Best: ' + store.streak.longest;

    // Flame state
    el.streakFlame.className = 'streak-flame';
    el.streakNumber.className = 'streak-number';
    if (store.streak.current >= 7) {
      el.streakFlame.classList.add('hot');
      el.streakNumber.classList.add('active');
    } else if (store.streak.current >= 1) {
      el.streakFlame.classList.add('active');
      el.streakNumber.classList.add('active');
    }

    // Weekly dots
    const weekDates = getWeekDates();
    const today = getLocalDateStr();
    const dots = el.streakWeek.querySelectorAll('.streak-dot');
    dots.forEach(function (dot, i) {
      dot.classList.remove('active', 'today');
      if (weekDates[i] === today) {
        dot.classList.add('today');
      }
      if (store.streak.weekActivity[weekDates[i]]) {
        dot.classList.add('active');
      }
    });

    // Stats
    el.statMessages.textContent = store.stats.totalMessages;
    const topicCount = Object.values(store.topicsExplored).filter(Boolean).length;
    el.statTopics.textContent = topicCount + ' / 4';
    el.statSince.textContent = formatDate(store.stats.firstMessageDate);

    // Badge count
    const unlockedCount = Object.values(store.achievements).filter(function (a) { return a.unlocked; }).length;
    el.badgeCount.textContent = unlockedCount + ' / ' + ACHIEVEMENTS.length;

    // Render badges
    renderBadgeGrid();
  }

  function renderBadgeGrid() {
    el.badgeGrid.innerHTML = '';
    ACHIEVEMENTS.forEach(function (a) {
      const badge = document.createElement('div');
      badge.className = 'badge';
      badge.setAttribute('role', 'listitem');
      badge.setAttribute('data-badge', a.id);
      badge.setAttribute('tabindex', '0');

      const isUnlocked = store.achievements[a.id] && store.achievements[a.id].unlocked;
      if (isUnlocked) {
        badge.classList.add('unlocked');
        if (a.color === 'warm') badge.classList.add('warm');
        if (a.color === 'info') badge.classList.add('info');
      }

      badge.innerHTML = '<span>' + a.icon + '</span>';

      if (!isUnlocked) {
        const lock = document.createElement('div');
        lock.className = 'badge__lock';
        lock.innerHTML = '<svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM15 8H9V6c0-1.66 1.34-3 3-3s3 1.34 3 3v2z"/></svg>';
        badge.appendChild(lock);
      }

      // Tooltip events — hover for desktop, click/tap for mobile
      badge.addEventListener('mouseenter', function (e) { showBadgeTooltip(a, e); });
      badge.addEventListener('mouseleave', hideBadgeTooltip);
      badge.addEventListener('focus', function (e) { showBadgeTooltip(a, e); });
      badge.addEventListener('blur', hideBadgeTooltip);
      badge.addEventListener('click', function (e) {
        e.stopPropagation();
        var isVisible = !el.badgeTooltip.hidden &&
          el.tooltipName.textContent === a.name;
        if (isVisible) {
          hideBadgeTooltip();
        } else {
          showBadgeTooltip(a, e);
        }
      });

      el.badgeGrid.appendChild(badge);
    });
  }

  function markBadgeUnlocked(badgeId) {
    const badge = el.badgeGrid.querySelector('[data-badge="' + badgeId + '"]');
    if (badge) {
      badge.classList.add('just-unlocked');
      setTimeout(function () {
        badge.classList.remove('just-unlocked');
      }, 600);
    }
    renderBadgeGrid();
  }

  /* ─── Badge Tooltip ─── */
  function showBadgeTooltip(achievement, event) {
    const isUnlocked = store.achievements[achievement.id] && store.achievements[achievement.id].unlocked;

    el.tooltipName.textContent = achievement.name;
    el.tooltipDesc.textContent = isUnlocked ? achievement.desc : 'Locked \u2014 ' + achievement.desc;
    el.tooltipDate.textContent = isUnlocked ?
      'Unlocked ' + formatDate(store.achievements[achievement.id].unlockedAt) : '';

    el.badgeTooltip.hidden = false;

    const rect = event.target.closest('.badge').getBoundingClientRect();
    const ttRect = el.badgeTooltip.getBoundingClientRect();

    let left = rect.left + rect.width / 2 - ttRect.width / 2;
    let top = rect.top - ttRect.height - 8;

    // Keep in viewport
    if (left < 8) left = 8;
    if (left + ttRect.width > window.innerWidth - 8) left = window.innerWidth - ttRect.width - 8;
    if (top < 8) top = rect.bottom + 8;

    el.badgeTooltip.style.left = left + 'px';
    el.badgeTooltip.style.top = top + 'px';
  }

  function hideBadgeTooltip() {
    el.badgeTooltip.hidden = true;
  }

  /* ═══════════════════════════════════════════════════════
     LEVEL-UP ANIMATION
     ═══════════════════════════════════════════════════════ */

  function showLevelUpAnimation(levelInfo) {
    el.levelupRank.textContent = levelInfo.name;
    el.levelupLevel.textContent = 'Level ' + levelInfo.level;
    el.levelupOverlay.hidden = false;

    // Glow on level card
    el.levelCard.classList.add('glow');
    setTimeout(function () { el.levelCard.classList.remove('glow'); }, 2000);

    // Particles
    el.levelupParticles.innerHTML = '';
    const colors = ['#00e676', '#69f0ae', '#ffab00', '#ffd740', '#00e676'];
    for (let i = 0; i < 28; i++) {
      const p = document.createElement('div');
      p.className = 'levelup-particle';
      const angle = (Math.PI * 2 * i) / 28 + (Math.random() - 0.5) * 0.5;
      const dist = 80 + Math.random() * 120;
      p.style.setProperty('--px', Math.cos(angle) * dist + 'px');
      p.style.setProperty('--py', Math.sin(angle) * dist + 'px');
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = (Math.random() * 0.3) + 's';
      p.style.width = (4 + Math.random() * 4) + 'px';
      p.style.height = p.style.width;
      el.levelupParticles.appendChild(p);
    }

    // Auto-dismiss
    const dismiss = function () {
      el.levelupOverlay.hidden = true;
      el.levelupOverlay.removeEventListener('click', dismiss);
    };

    el.levelupOverlay.addEventListener('click', dismiss);
    setTimeout(dismiss, 3000);
  }

  /* ═══════════════════════════════════════════════════════
     ACHIEVEMENT TOAST
     ═══════════════════════════════════════════════════════ */

  function showAchievementToast(achievement) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    if (achievement.color === 'warm') toast.classList.add('toast--warm');

    toast.innerHTML =
      '<span class="toast__icon">' + achievement.icon + '</span>' +
      '<div class="toast__body">' +
        '<div class="toast__label">Achievement Unlocked</div>' +
        '<div class="toast__name">' + escapeHtml(achievement.name) + '</div>' +
      '</div>' +
      '<div class="toast__progress"></div>';

    el.toastContainer.appendChild(toast);

    setTimeout(function () {
      toast.classList.add('exiting');
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, 4000);
  }

  /* ═══════════════════════════════════════════════════════
     MOBILE SIDEBAR
     ═══════════════════════════════════════════════════════ */

  function setupSidebar() {
    el.sidebarToggle.addEventListener('click', toggleSidebar);
    el.sidebarBackdrop.addEventListener('click', closeSidebar);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (!el.levelupOverlay.hidden) {
          el.levelupOverlay.hidden = true;
          return;
        }
        if (!el.resetModal.hidden) {
          el.resetModal.hidden = true;
          return;
        }
        if (el.sidebar.classList.contains('open')) {
          closeSidebar();
        }
      }
    });
  }

  function toggleSidebar() {
    const isOpen = el.sidebar.classList.contains('open');
    if (isOpen) {
      closeSidebar();
    } else {
      openSidebar();
    }
  }

  function openSidebar() {
    el.sidebar.classList.add('open');
    el.sidebarBackdrop.classList.add('visible');
    el.sidebarToggle.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    el.sidebar.classList.remove('open');
    el.sidebarBackdrop.classList.remove('visible');
    el.sidebarToggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    el.sidebarToggle.focus();
  }

  /* ═══════════════════════════════════════════════════════
     RESET
     ═══════════════════════════════════════════════════════ */

  function setupReset() {
    el.resetBtn.addEventListener('click', function () {
      el.resetModal.hidden = false;
    });

    el.resetCancel.addEventListener('click', function () {
      el.resetModal.hidden = true;
    });

    el.resetConfirm.addEventListener('click', function () {
      localStorage.removeItem(STORAGE_KEY);
      store = defaultStore();
      el.resetModal.hidden = true;
      renderChatHistory();
      renderSidebar();
    });
  }

  /* ═══════════════════════════════════════════════════════
     INITIALIZATION
     ═══════════════════════════════════════════════════════ */

  function init() {
    cacheDom();
    loadStore();

    // Restore persisted time-of-day flags
    store._earlyBird = store._persistedEarlyBird || false;
    store._nightOwl = store._persistedNightOwl || false;

    getOrCreateSessionId();

    renderChatHistory();
    renderSidebar();

    setupInput();
    setupStarterPrompts();
    setupSidebar();
    setupReset();

    // Dismiss badge tooltip when tapping outside
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.badge') && !el.badgeTooltip.hidden) {
        hideBadgeTooltip();
      }
    });

    // Mark body loaded for fade-in
    document.body.classList.add('loaded');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

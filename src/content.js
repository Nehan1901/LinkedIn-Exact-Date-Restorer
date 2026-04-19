(() => {
  const RELATIVE_DATE_REGEX = /\b(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago\b/i;
  const SPECIAL_RELATIVE_TEXT = new Set(['just now', 'moments ago', 'yesterday']);
  const UNIT_MS = {
    second: 1000,
    minute: 60000,
    hour: 3600000,
    day: 86400000,
    week: 604800000,
    month: 2592000000,
    year: 31536000000
  };

  const state = {
    enabled: true,
    format: 'long',
    observer: null,
    queued: false
  };

  let timeoutId = null;
  let lastUrl = location.href;

  function formatDate(epochMs, format) {
    const date = new Date(epochMs);

    if (format === 'iso') {
      return date.toISOString().slice(0, 10);
    }

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(date);
  }

  function estimateDate(relativeText) {
    const normalized = relativeText.replace(/\s+/g, ' ').trim().toLowerCase();
    const now = Date.now();

    if (normalized === 'just now' || normalized === 'moments ago') {
      return now;
    }

    if (normalized === 'yesterday') {
      return now - UNIT_MS.day;
    }

    const match = normalized.match(RELATIVE_DATE_REGEX);
    if (!match) {
      return null;
    }

    const amount = Number.parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    const unitMs = UNIT_MS[unit];

    if (!Number.isFinite(amount) || !unitMs) {
      return null;
    }

    return now - (amount * unitMs);
  }

  function injectStyles() {
    if (document.getElementById('ld-styles')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'ld-styles';
    style.textContent = `
      [data-ld-date]::after { content: attr(data-ld-date); }
      [data-ld-date] > * { display: none !important; }
    `;

    (document.head || document.documentElement).appendChild(style);
  }

  function isRelativeDateText(text) {
    const normalized = text.replace(/\s+/g, ' ').trim().toLowerCase();
    return RELATIVE_DATE_REGEX.test(normalized) || SPECIAL_RELATIVE_TEXT.has(normalized);
  }

  function replaceRelativeDates() {
    if (!state.enabled || !document.body) {
      return;
    }

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const parent = node.parentElement;
        if (!parent) {
          return NodeFilter.FILTER_REJECT;
        }

        const tagName = parent.tagName;
        if (tagName === 'SCRIPT' || tagName === 'STYLE' || tagName === 'NOSCRIPT' || tagName === 'CODE') {
          return NodeFilter.FILTER_REJECT;
        }

        return isRelativeDateText(node.textContent || '')
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP;
      }
    });

    let currentNode = walker.nextNode();
    while (currentNode) {
      const parent = currentNode.parentElement;
      if (parent && !parent.hasAttribute('data-ld-date')) {
        const timestamp = estimateDate(currentNode.textContent || '');
        if (timestamp !== null) {
          parent.setAttribute('data-ld-date', formatDate(timestamp, state.format));
        }
      }

      currentNode = walker.nextNode();
    }
  }

  function queueReplaceRelativeDates() {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    state.queued = true;
    timeoutId = window.setTimeout(() => {
      timeoutId = null;
      state.queued = false;
      replaceRelativeDates();
    }, 300);
  }

  function startObserver() {
    if (state.observer) {
      state.observer.disconnect();
    }

    state.observer = new MutationObserver(() => {
      queueReplaceRelativeDates();

      if (location.href !== lastUrl) {
        lastUrl = location.href;
        const replacedNodes = document.querySelectorAll('[data-ld-date]');
        for (const node of replacedNodes) {
          node.removeAttribute('data-ld-date');
        }

        window.setTimeout(() => {
          replaceRelativeDates();
        }, 600);
      }
    });

    state.observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  async function loadSettings() {
    const { format = 'long', enabled = true } = await chrome.storage.sync.get(['format', 'enabled']);
    state.format = format === 'iso' ? 'iso' : 'long';
    state.enabled = enabled !== false;
  }

  function handleStorageChange(changes, areaName) {
    if (areaName !== 'sync') {
      return;
    }

    if (changes.format) {
      state.format = changes.format.newValue === 'iso' ? 'iso' : 'long';
    }

    if (changes.enabled) {
      state.enabled = changes.enabled.newValue !== false;
    }

    replaceRelativeDates();
  }

  async function init() {
    injectStyles();
    await loadSettings();
    chrome.storage.onChanged.addListener(handleStorageChange);
    startObserver();
    replaceRelativeDates();
  }

  void init();
})();

const DATE_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

const STATUS_CLASS_BY_TYPE = {
  info: 'news-feed__status--info',
  empty: 'news-feed__status--empty',
  error: 'news-feed__status--error',
};

const LOGO_PATH = '../images/logo-main.svg';

document.addEventListener('DOMContentLoaded', () => {
  const root = document.querySelector('[data-news-feed]');
  if (!root) return;

  const list = root.querySelector('[data-news-list]');
  const status = root.querySelector('[data-news-status]');
  if (!list || !status) return;

  loadTelegramNews({ list, status });
});

async function loadTelegramNews({ list, status }) {
  setStatus(status, 'Загрузка публикаций...', 'info');

  try {
    const items = (await fetchNews()).filter(shouldRenderNewsItem);
    if (!items.length) {
      list.replaceChildren();
      setStatus(status, 'Публикаций пока нет.', 'empty');
      return;
    }

    const fragment = document.createDocumentFragment();
    items.forEach((item) => {
      fragment.append(createNewsCard(item));
    });

    list.replaceChildren(fragment);
    status.remove();
  } catch (error) {
    setStatus(
      status,
      'Не удалось загрузить публикации. Проверьте data/news.json.',
      'error',
      () => loadTelegramNews({ list, status }),
    );
    console.error(error);
  }
}

function shouldRenderNewsItem(item) {
  if (!item || typeof item !== 'object') return false;
  const hasText = typeof item.text === 'string' && item.text.trim().length > 0;
  const hasMedia = Array.isArray(item.media) && item.media.length > 0;
  return hasText || hasMedia;
}

function createNewsCard(item) {
  const media = Array.isArray(item.media) ? item.media : [];
  const hasMedia = media.length > 0;
  const hasVideo = media.some(isPlayableVideoMedia);

  const card = document.createElement('article');
  card.className = 'news-card';
  if (!hasMedia) card.classList.add('news-card--text-only');

  const body = document.createElement('div');
  body.className = 'news-card__body';

  const date = document.createElement('time');
  date.className = 'news-card__date';
  date.textContent = formatDate(item.date);
  body.append(date);

  const text = document.createElement('p');
  text.className = 'news-card__text';
  text.textContent = item.text || 'Без текста';
  body.append(text);

  if (hasMedia) {
    const actions = document.createElement('div');
    actions.className = 'news-card__actions';

    const button = document.createElement('button');
    button.className = 'news-card__media-button';
    button.type = 'button';
    button.textContent = 'Посмотреть медиа';
    button.addEventListener('click', () => {
      openNewsMediaModal({ media });
    });

    const meta = document.createElement('span');
    meta.className = 'news-card__media-meta';
    const mediaLabel = hasVideo ? 'медиа, включая видео' : 'медиа';
    meta.textContent = `${media.length} ${mediaLabel}`;

    actions.append(button, meta);
    body.append(actions);
  }

  const aside = document.createElement('div');
  aside.className = 'news-card__aside';

  const logoWrap = document.createElement('div');
  logoWrap.className = 'news-card__logo';
  const logo = document.createElement('img');
  logo.className = 'news-card__logo-image';
  logo.src = LOGO_PATH;
  logo.alt = 'HYPROTEC';
  logo.loading = 'lazy';
  logoWrap.append(logo);
  aside.append(logoWrap);

  if (hasMedia) {
    const tag = document.createElement('span');
    tag.className = 'news-card__tag';
    tag.textContent = hasVideo ? 'Фото и видео' : 'Фотогалерея';
    aside.append(tag);
  }

  card.append(body, aside);
  return card;
}

function openNewsMediaModal({ media }) {
  const safeMedia = (Array.isArray(media) ? media : []).filter(
    (entry) => hasImageMedia(entry) || hasVideoPath(entry),
  );
  if (!safeMedia.length) return;

  const previouslyFocused =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const overlay = document.createElement('div');
  overlay.className = 'news-modal';

  const dialog = document.createElement('div');
  dialog.className = 'news-modal__dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', 'Медиа публикации');

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'news-modal__close';
  close.setAttribute('aria-label', 'Закрыть окно');
  close.textContent = '×';

  const viewport = document.createElement('div');
  viewport.className = 'news-modal__viewport';

  const stage = document.createElement('div');
  stage.className = 'news-modal__stage';
  viewport.append(stage);

  const footer = document.createElement('div');
  footer.className = 'news-modal__footer';

  const prev = createModalPagerButton('prev');
  const counter = document.createElement('span');
  counter.className = 'news-modal__counter';
  const next = createModalPagerButton('next');
  footer.append(prev, counter, next);

  dialog.append(close, viewport, footer);
  overlay.append(dialog);
  document.body.append(overlay);

  const startMedia = pickCoverMedia(safeMedia);
  let activeIndex = Math.max(
    0,
    safeMedia.findIndex((entry) => entry.key === startMedia?.key),
  );

  const hasPagination = safeMedia.length > 1;
  prev.hidden = !hasPagination;
  next.hidden = !hasPagination;
  counter.hidden = !hasPagination;

  if (hasPagination) {
    prev.addEventListener('click', () => {
      setActive(activeIndex - 1);
    });

    next.addEventListener('click', () => {
      setActive(activeIndex + 1);
    });

    let touchStartX = 0;
    let touchStartY = 0;

    stage.addEventListener(
      'touchstart',
      (event) => {
        const touch = event.changedTouches?.[0];
        if (!touch) return;
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
      },
      { passive: true },
    );

    stage.addEventListener(
      'touchend',
      (event) => {
        const touch = event.changedTouches?.[0];
        if (!touch) return;

        const deltaX = touch.clientX - touchStartX;
        const deltaY = touch.clientY - touchStartY;
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);
        if (absX < 44 || absX < absY) return;

        if (deltaX < 0) {
          setActive(activeIndex + 1);
          return;
        }

        setActive(activeIndex - 1);
      },
      { passive: true },
    );
  }

  function setActive(nextIndex) {
    const max = safeMedia.length;
    activeIndex = (nextIndex + max) % max;

    stage.replaceChildren(createModalMediaNode(safeMedia[activeIndex]));
    counter.textContent = `${activeIndex + 1} / ${max}`;
  }

  function closeModal() {
    dialog.querySelectorAll('video').forEach((video) => {
      video.pause();
    });
    document.body.classList.remove('is-news-modal-open');
    document.documentElement.classList.remove('is-news-modal-open');
    document.removeEventListener('keydown', onKeyDown);
    overlay.remove();
    if (previouslyFocused?.isConnected) {
      previouslyFocused.focus({ preventScroll: true });
    }
  }

  function trapFocus(event) {
    if (event.key !== 'Tab') return;

    const focusable = Array.from(
      dialog.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((node) => !node.hasAttribute('disabled'));

    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus({ preventScroll: true });
      return;
    }

    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      closeModal();
      return;
    }
    trapFocus(event);
    if (!hasPagination) return;
    if (event.key === 'ArrowLeft') {
      setActive(activeIndex - 1);
    } else if (event.key === 'ArrowRight') {
      setActive(activeIndex + 1);
    }
  }

  close.addEventListener('click', closeModal);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeModal();
  });
  document.addEventListener('keydown', onKeyDown);

  document.body.classList.add('is-news-modal-open');
  document.documentElement.classList.add('is-news-modal-open');
  requestAnimationFrame(() => {
    overlay.classList.add('is-open');
    close.focus({ preventScroll: true });
  });
  setActive(activeIndex);
}

function createModalPagerButton(direction) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `news-modal__pager-button news-modal__pager-button--${direction}`;
  button.setAttribute(
    'aria-label',
    direction === 'next' ? 'Следующее медиа' : 'Предыдущее медиа',
  );
  button.textContent = direction === 'next' ? '›' : '‹';
  return button;
}

function createModalMediaNode(media) {
  if (isPlayableVideoMedia(media)) {
    const video = document.createElement('video');
    video.className = 'news-modal__video';
    video.controls = true;
    video.preload = 'metadata';
    video.playsInline = true;

    if (hasImageMedia(media)) {
      video.poster = normalizeMediaPath(media.image);
    }

    const source = document.createElement('source');
    source.src = normalizeMediaPath(media.video);
    source.type = guessVideoMime(source.src);
    video.append(source);
    return video;
  }

  if (hasImageMedia(media)) {
    const image = document.createElement('img');
    image.className = 'news-modal__image';
    image.src = normalizeMediaPath(media.image);
    image.alt = '';
    image.loading = 'lazy';
    return image;
  }

  const empty = document.createElement('div');
  empty.className = 'news-modal__empty';
  empty.textContent = 'MEDIA';
  return empty;
}

function pickCoverMedia(media) {
  if (!Array.isArray(media) || !media.length) return null;

  const playableVideo = media.find(isPlayableVideoMedia);
  if (playableVideo) return playableVideo;

  const firstWithImage = media.find(hasImageMedia);
  if (firstWithImage) return firstWithImage;

  return media[0];
}

async function fetchNews() {
  const urls = ['../data/news.json', '/data/news.json'];

  for (const url of urls) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) continue;

      const data = await response.json();
      if (!Array.isArray(data)) continue;

      return data
        .filter((item) => typeof item === 'object' && item !== null)
        .map(normalizeNewsItem)
        .sort((a, b) => toTimestamp(b.date) - toTimestamp(a.date));
    } catch (_error) {
      // try next candidate
    }
  }

  throw new Error('News file is not available');
}

function normalizeNewsItem(item) {
  const normalized = { ...item };
  normalized.text =
    typeof item.text === 'string' && item.text.trim()
      ? item.text.trim()
      : 'Без текста';

  normalized.media = Array.isArray(item.media)
    ? item.media
        .filter((entry) => {
          if (!entry || typeof entry !== 'object') return false;
          return hasImageMedia(entry) || hasVideoPath(entry);
        })
        .map((entry) => {
          const video = hasVideoPath(entry) ? entry.video : '';
          const image = hasImageMedia(entry) ? entry.image : '';
          return {
            type: video ? 'video' : 'photo',
            image,
            video,
            key:
              entry.key ||
              `${entry.type || 'photo'}:${entry.image || entry.video || 'legacy'}`,
          };
        })
    : [];

  if (!normalized.media.length) {
    const hasImage = hasNonEmptyString(normalized.image);
    const hasVideo = hasNonEmptyString(normalized.video);

    if (hasImage || hasVideo) {
      normalized.media.push({
        type: hasVideo ? 'video' : 'photo',
        image: hasImage ? normalized.image : '',
        video: hasVideo ? normalized.video : '',
        key: `legacy:${normalized.id || normalized.date || Math.random()}`,
      });
    }
  }

  normalized.media_count = normalized.media.length;
  normalized.has_video = normalized.media.some(isPlayableVideoMedia);

  return normalized;
}

function normalizeMediaPath(mediaPath) {
  if (!mediaPath || typeof mediaPath !== 'string') return '';
  if (
    mediaPath.startsWith('http://') ||
    mediaPath.startsWith('https://') ||
    mediaPath.startsWith('/')
  ) {
    return mediaPath;
  }
  return `../${mediaPath.replace(/^\.?\//, '')}`;
}

function guessVideoMime(src) {
  const lower = String(src || '').toLowerCase();
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.ogg') || lower.endsWith('.ogv')) return 'video/ogg';
  return 'video/mp4';
}

function formatDate(value) {
  const timestamp = toTimestamp(value);
  if (!timestamp) return 'Дата не указана';
  return DATE_FORMATTER.format(new Date(timestamp));
}

function hasNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasImageMedia(media) {
  return Boolean(media && hasNonEmptyString(media.image));
}

function hasVideoPath(media) {
  return Boolean(media && hasNonEmptyString(media.video));
}

function isPlayableVideoMedia(media) {
  return Boolean(media && media.type === 'video' && hasVideoPath(media));
}

function setStatus(status, message, type = 'info', onRetry) {
  status.classList.remove(...Object.values(STATUS_CLASS_BY_TYPE));
  status.classList.add(STATUS_CLASS_BY_TYPE[type] || STATUS_CLASS_BY_TYPE.info);

  const messageText = document.createElement('span');
  messageText.className = 'news-feed__status-text';
  messageText.textContent = message;
  status.replaceChildren(messageText);

  if (typeof onRetry === 'function') {
    const retryButton = document.createElement('button');
    retryButton.type = 'button';
    retryButton.className = 'news-feed__retry';
    retryButton.textContent = 'Повторить';
    retryButton.addEventListener('click', () => {
      retryButton.disabled = true;
      onRetry();
    });
    status.append(retryButton);
  }
}

function toTimestamp(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 0;
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 0;

    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber) && trimmed.length >= 10) {
      return asNumber < 1_000_000_000_000 ? asNumber * 1000 : asNumber;
    }

    const parsed = Date.parse(trimmed);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

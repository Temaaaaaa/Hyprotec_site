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
  const card = document.createElement('article');
  card.className = 'news-card';

  const mediaRoot = document.createElement('div');
  mediaRoot.className = 'news-card__media';

  const coverMedia = pickCoverMedia(item.media);
  mediaRoot.append(createCoverNode(coverMedia));

  const badges = createBadges(item);
  if (badges) mediaRoot.append(badges);

  const thumbs = createThumbs(item, coverMedia);
  if (thumbs) mediaRoot.append(thumbs);

  if (!coverMedia) {
    card.classList.add('news-card--no-media');
  }

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

  card.append(mediaRoot, body);
  return card;
}

function createCoverNode(media) {
  if (isPlayableVideoMedia(media)) {
    const video = document.createElement('video');
    video.className = 'news-card__video';
    video.controls = true;
    video.preload = 'metadata';
    video.playsInline = true;
    video.setAttribute('aria-label', 'Видео публикации');

    const normalizedVideoPath = normalizeMediaPath(media.video);
    const normalizedPosterPath = media.image ? normalizeMediaPath(media.image) : '';
    if (normalizedPosterPath) {
      video.poster = normalizedPosterPath;
    }

    video.addEventListener(
      'error',
      () => {
        const fallbackNode = normalizedPosterPath
          ? createImageNode(normalizedPosterPath)
          : createEmptyMediaNode();
        video.replaceWith(fallbackNode);
      },
      { once: true },
    );

    const source = document.createElement('source');
    source.src = normalizedVideoPath;
    source.type = guessVideoMime(source.src);
    video.append(source);

    return video;
  }

  if (hasImageMedia(media)) {
    return createImageNode(normalizeMediaPath(media.image));
  }

  return createEmptyMediaNode();
}

function createImageNode(src) {
  const image = document.createElement('img');
  image.className = 'news-card__image';
  image.src = src;
  image.alt = '';
  image.loading = 'lazy';
  return image;
}

function createEmptyMediaNode() {
  const empty = document.createElement('div');
  empty.className = 'news-card__image news-card__image--empty';
  empty.textContent = 'HYPROTEC';
  return empty;
}

function createBadges(item) {
  const media = Array.isArray(item.media) ? item.media : [];
  const hasVideo = media.some(isPlayableVideoMedia);
  const mediaCount = media.length || Number(item.media_count) || 0;
  if (!hasVideo && mediaCount <= 1) return null;

  const wrap = document.createElement('div');
  wrap.className = 'news-card__badges';

  if (hasVideo) {
    const video = document.createElement('span');
    video.className = 'news-card__badge news-card__badge--video';
    video.textContent = 'Видео';
    wrap.append(video);
  }

  if (mediaCount > 1) {
    const count = document.createElement('span');
    count.className = 'news-card__badge news-card__badge--count';
    count.textContent = `${mediaCount} медиа`;
    wrap.append(count);
  }

  return wrap;
}

function createThumbs(item, coverMedia) {
  if (!Array.isArray(item.media) || item.media.length <= 1) return null;

  const coverKey = coverMedia?.key || '';
  const others = item.media.filter((entry) => entry.key !== coverKey).slice(0, 3);
  if (!others.length) return null;

  const thumbs = document.createElement('div');
  thumbs.className = 'news-card__thumbs';

  others.forEach((entry) => {
    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'news-card__thumb-wrap';

    if (hasImageMedia(entry)) {
      const thumb = document.createElement('img');
      thumb.className = 'news-card__thumb';
      thumb.src = normalizeMediaPath(entry.image);
      thumb.alt = '';
      thumb.loading = 'lazy';
      thumbWrap.append(thumb);
    } else {
      const empty = document.createElement('div');
      empty.className = 'news-card__thumb news-card__thumb--empty';
      empty.textContent = 'MEDIA';
      thumbWrap.append(empty);
    }

    if (isPlayableVideoMedia(entry)) {
      const play = document.createElement('span');
      play.className = 'news-card__thumb-play';
      play.textContent = '▶';
      thumbWrap.append(play);
    }

    thumbs.append(thumbWrap);
  });

  return thumbs;
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

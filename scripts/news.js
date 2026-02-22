const DATE_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

document.addEventListener('DOMContentLoaded', () => {
  const root = document.querySelector('[data-news-feed]');
  if (!root) return;

  const list = root.querySelector('[data-news-list]');
  const status = root.querySelector('[data-news-status]');
  if (!list || !status) return;

  loadTelegramNews(list, status);
});

async function loadTelegramNews(list, status) {
  try {
    const items = await fetchNews();
    if (!items.length) {
      status.textContent = 'Публикаций пока нет.';
      return;
    }

    const fragment = document.createDocumentFragment();
    items.forEach((item) => {
      fragment.append(createNewsCard(item));
    });

    list.replaceChildren(fragment);
    status.remove();
  } catch (error) {
    status.textContent =
      'Не удалось загрузить публикации. Проверьте data/news.json.';
    console.error(error);
  }
}

function createNewsCard(item) {
  const card = document.createElement('article');
  card.className = 'news-card';

  const mediaRoot = document.createElement('div');
  mediaRoot.className = 'news-card__media';

  const coverImage = getCoverImage(item);
  if (coverImage) {
    const image = document.createElement('img');
    image.className = 'news-card__image';
    image.src = normalizeImagePath(coverImage);
    image.alt = '';
    image.loading = 'lazy';
    mediaRoot.append(image);
  } else {
    const empty = document.createElement('div');
    empty.className = 'news-card__image news-card__image--empty';
    empty.textContent = 'HYPROTEC';
    mediaRoot.append(empty);
  }

  const badges = createBadges(item);
  if (badges) mediaRoot.append(badges);

  const thumbs = createThumbs(item);
  if (thumbs) mediaRoot.append(thumbs);

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

function createBadges(item) {
  const hasVideo = Boolean(item.has_video);
  const mediaCount = Number(item.media_count) || item.media.length;
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

function createThumbs(item) {
  if (!Array.isArray(item.media) || item.media.length <= 1) return null;

  const others = item.media
    .slice(1, 4)
    .map((media) => normalizeImagePath(media.image));
  if (!others.length) return null;

  const thumbs = document.createElement('div');
  thumbs.className = 'news-card__thumbs';

  others.forEach((src) => {
    const thumb = document.createElement('img');
    thumb.className = 'news-card__thumb';
    thumb.src = src;
    thumb.alt = '';
    thumb.loading = 'lazy';
    thumbs.append(thumb);
  });

  return thumbs;
}

function getCoverImage(item) {
  if (typeof item.image === 'string' && item.image.trim()) return item.image;
  if (!Array.isArray(item.media)) return '';
  const mediaWithImage = item.media.find(
    (media) => media && typeof media.image === 'string' && media.image.trim(),
  );
  return mediaWithImage?.image || '';
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
  normalized.media = Array.isArray(item.media)
    ? item.media
        .filter(
          (media) =>
            media && typeof media.image === 'string' && media.image.trim(),
        )
        .map((media) => ({
          type: media.type === 'video' ? 'video' : 'photo',
          image: media.image,
        }))
    : [];

  if (
    !normalized.media.length &&
    typeof normalized.image === 'string' &&
    normalized.image.trim()
  ) {
    normalized.media.push({
      type: normalized.has_video ? 'video' : 'photo',
      image: normalized.image,
    });
  }

  normalized.media_count =
    Number(normalized.media_count) || normalized.media.length;
  normalized.has_video =
    Boolean(normalized.has_video) ||
    normalized.media.some((media) => media.type === 'video');

  return normalized;
}

function normalizeImagePath(imagePath) {
  if (!imagePath || typeof imagePath !== 'string') return '';
  if (
    imagePath.startsWith('http://') ||
    imagePath.startsWith('https://') ||
    imagePath.startsWith('/')
  ) {
    return imagePath;
  }
  return `../${imagePath.replace(/^\.?\//, '')}`;
}

function formatDate(value) {
  const timestamp = toTimestamp(value);
  if (!timestamp) return 'Дата не указана';
  return DATE_FORMATTER.format(new Date(timestamp));
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

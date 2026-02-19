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
      const card = document.createElement('article');
      card.className = 'news-card';

      if (item.image) {
        const image = document.createElement('img');
        image.className = 'news-card__image';
        image.src = normalizeImagePath(item.image);
        image.alt = '';
        image.loading = 'lazy';
        card.append(image);
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

      card.append(body);
      fragment.append(card);
    });

    list.replaceChildren(fragment);
    status.remove();
  } catch (error) {
    status.textContent =
      'Не удалось загрузить публикации. Проверьте data/news.json.';
    console.error(error);
  }
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
        .sort((a, b) => toTimestamp(b.date) - toTimestamp(a.date));
    } catch (_error) {
      // Move to next URL candidate.
    }
  }

  throw new Error('News file is not available');
}

function normalizeImagePath(path) {
  if (!path || typeof path !== 'string') return '';
  if (
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('/')
  )
    return path;
  return `../${path.replace(/^\.?\//, '')}`;
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

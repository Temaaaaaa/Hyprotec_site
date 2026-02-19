const fs = require('fs');
const path = require('path');

const TOKEN = process.env.TG_TOKEN;
const CHANNEL_ID = '-1003859497665';
const NEWS_IMAGE_PATH = './images/news'; // Путь к твоим картинкам
const STATE_PATH = './data/tg_state.json';

function readState() {
  if (!fs.existsSync(STATE_PATH)) return { lastUpdateId: null };
  try {
    const raw = fs.readFileSync(STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    return {
      lastUpdateId: Number.isFinite(parsed.lastUpdateId)
        ? parsed.lastUpdateId
        : null,
    };
  } catch (_e) {
    return { lastUpdateId: null };
  }
}

function writeState(lastUpdateId) {
  if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true });
  const payload = {
    lastUpdateId: Number.isFinite(lastUpdateId) ? lastUpdateId : null,
  };
  fs.writeFileSync(STATE_PATH, JSON.stringify(payload, null, 2));
}

function toUnix(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1_000_000_000_000 ? Math.floor(value / 1000) : value;
  }

  if (typeof value === 'string') {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) return toUnix(asNumber);
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return Math.floor(parsed / 1000);
  }

  return 0;
}

// Функция для скачивания файла
async function downloadFile(fileId, fileName) {
  try {
    const getFileUrl = `https://api.telegram.org/bot${TOKEN}/getFile?file_id=${fileId}`;
    const res = await fetch(getFileUrl);
    if (!res.ok) return null;
    const data = await res.json();

    if (data.ok) {
      const filePath = data.result.file_path;
      const downloadUrl = `https://api.telegram.org/file/bot${TOKEN}/${filePath}`;

      const fileRes = await fetch(downloadUrl);
      if (!fileRes.ok) return null;
      const buffer = await fileRes.arrayBuffer();

      // Проверяем, существует ли папка, если нет — создаем
      if (!fs.existsSync(NEWS_IMAGE_PATH)) {
        fs.mkdirSync(NEWS_IMAGE_PATH, { recursive: true });
      }

      const finalPath = path.join(NEWS_IMAGE_PATH, fileName);
      fs.writeFileSync(finalPath, Buffer.from(buffer));

      // Возвращаем путь, который будет работать в HTML (относительно корня)
      return `images/news/${fileName}`;
    }
  } catch (e) {
    console.error('Ошибка при скачивании фото:', e.message);
  }
  return null;
}

async function fetchTelegramNews() {
  if (!TOKEN) {
    console.error('❌ Переменная окружения TG_TOKEN не задана');
    process.exit(1);
  }

  const state = readState();
  const params = new URLSearchParams({
    limit: '100',
    allowed_updates: JSON.stringify(['channel_post']),
  });

  if (Number.isFinite(state.lastUpdateId)) {
    params.set('offset', String(state.lastUpdateId + 1));
  }

  const url = `https://api.telegram.org/bot${TOKEN}/getUpdates?${params.toString()}`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    if (!data.ok) throw new Error(data.description);

    const maxUpdateId = data.result.reduce(
      (max, item) => {
        if (!Number.isFinite(item.update_id)) return max;
        return Math.max(max, item.update_id);
      },
      Number.isFinite(state.lastUpdateId) ? state.lastUpdateId : 0,
    );

    // Используем Promise.all, так как внутри map теперь есть асинхронное скачивание фото
    const posts = await Promise.all(
      data.result
        .filter((item) => {
          const post = item.channel_post;
          return post && String(post.chat.id) === String(CHANNEL_ID);
        })
        .map(async (item) => {
          const post = item.channel_post;
          let imagePath = null;

          // Если в посте есть фото
          if (post.photo && post.photo.length > 0) {
            // Telegram присылает массив разных размеров, берем последний (самый большой)
            const photo = post.photo[post.photo.length - 1];
            const fileName = `news_${post.message_id}.jpg`;
            imagePath = await downloadFile(photo.file_id, fileName);
          }

          return {
            id: post.message_id,
            text: post.text || post.caption || 'Без текста',
            date: post.date, // unix timestamp (sec)
            image: imagePath, // Ссылка на локальный файл в images/news/
          };
        }),
    );

    // Логика сохранения в JSON (уже проверенная тобой)
    if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true });

    let existingNews = [];
    if (fs.existsSync('./data/news.json')) {
      try {
        existingNews = JSON.parse(
          fs.readFileSync('./data/news.json', 'utf8') || '[]',
        );
      } catch (e) {
        existingNews = [];
      }
    }

    // Сначала старые, потом новые — новые записи должны перезаписывать дубли по id.
    const mergedById = new Map();
    [...existingNews, ...posts].forEach((item) => {
      const prev = mergedById.get(item.id) || {};
      mergedById.set(item.id, {
        ...prev,
        ...item,
        image: item.image ?? prev.image ?? null,
      });
    });

    const uniqueNews = Array.from(mergedById.values())
      .sort((a, b) => toUnix(b.date) - toUnix(a.date))
      .slice(0, 10);

    fs.writeFileSync('./data/news.json', JSON.stringify(uniqueNews, null, 2));
    writeState(maxUpdateId);

    console.log(
      `✅ Обработано. Новостей с фото: ${posts.filter((p) => p.image).length}`,
    );
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    process.exit(1);
  }
}

fetchTelegramNews();

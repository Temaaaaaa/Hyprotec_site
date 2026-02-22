const fs = require('fs');
const path = require('path');

const TOKEN = process.env.TG_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID || '-1003859497665';
const NEWS_IMAGE_PATH = './images/news';
const DATA_DIR = './data';
const NEWS_PATH = './data/news.json';
const STATE_PATH = './data/tg_state.json';
const TG_IMAGE_PREFIX = 'tg_';
const MAX_NEWS_ITEMS =
  Number(process.env.MAX_NEWS_ITEMS) > 0
    ? Number(process.env.MAX_NEWS_ITEMS)
    : 10;

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function safeReadJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw || 'null') ?? fallback;
  } catch (_e) {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

function readState() {
  const state = safeReadJson(STATE_PATH, { lastUpdateId: null });
  return {
    lastUpdateId: Number.isFinite(state.lastUpdateId)
      ? state.lastUpdateId
      : null,
  };
}

function writeState(lastUpdateId) {
  ensureDir(DATA_DIR);
  writeJson(STATE_PATH, {
    lastUpdateId: Number.isFinite(lastUpdateId) ? lastUpdateId : null,
  });
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

function getBestPhotoFileId(photoList) {
  if (!Array.isArray(photoList) || !photoList.length) return null;
  return photoList[photoList.length - 1]?.file_id || null;
}

function getVideoThumbFileId(video) {
  if (!video || typeof video !== 'object') return null;
  return video.thumbnail?.file_id || video.thumb?.file_id || null;
}

function getPostMediaDescriptors(post) {
  const media = [];

  const photoFileId = getBestPhotoFileId(post.photo);
  if (photoFileId) {
    media.push({
      type: 'photo',
      fileId: photoFileId,
      key: `photo:${post.message_id}:${photoFileId}`,
    });
  }

  if (post.video) {
    const videoThumbFileId = getVideoThumbFileId(post.video);
    if (videoThumbFileId) {
      media.push({
        type: 'video',
        fileId: videoThumbFileId,
        key: `video:${post.message_id}:${videoThumbFileId}`,
      });
    }
  }

  return media;
}

function normalizeStoredItem(item) {
  if (!item || typeof item !== 'object' || item.id == null) return null;

  const normalizedMedia = Array.isArray(item.media)
    ? item.media
        .filter(
          (media) =>
            media && typeof media.image === 'string' && media.image.trim(),
        )
        .map((media) => ({
          type: media.type === 'video' ? 'video' : 'photo',
          image: media.image,
          key: media.key || `${media.type || 'photo'}:${media.image}`,
        }))
    : [];

  if (
    !normalizedMedia.length &&
    typeof item.image === 'string' &&
    item.image.trim()
  ) {
    normalizedMedia.push({
      type: item.has_video ? 'video' : 'photo',
      image: item.image,
      key: `legacy:${item.image}`,
    });
  }

  const sourceMessageIds = Array.isArray(item.source_message_ids)
    ? Array.from(
        new Set(item.source_message_ids.map(Number).filter(Number.isFinite)),
      )
    : [];

  return {
    id: item.id,
    text: typeof item.text === 'string' ? item.text : 'Без текста',
    date: toUnix(item.date),
    media: normalizedMedia,
    image: normalizedMedia[0]?.image || null,
    media_count: normalizedMedia.length,
    has_video: normalizedMedia.some((media) => media.type === 'video'),
    source_message_ids: sourceMessageIds,
  };
}

function readExistingNews() {
  const parsed = safeReadJson(NEWS_PATH, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.map((item) => normalizeStoredItem(item)).filter(Boolean);
}

async function downloadFile(fileId, fileName) {
  try {
    ensureDir(NEWS_IMAGE_PATH);

    const finalPath = path.join(NEWS_IMAGE_PATH, fileName);
    if (fs.existsSync(finalPath)) {
      return `images/news/${fileName}`;
    }

    const getFileUrl = `https://api.telegram.org/bot${TOKEN}/getFile?file_id=${fileId}`;
    const fileMetaResponse = await fetch(getFileUrl);
    if (!fileMetaResponse.ok) return null;
    const fileMeta = await fileMetaResponse.json();
    if (!fileMeta.ok) return null;

    const filePath = fileMeta.result.file_path;
    const downloadUrl = `https://api.telegram.org/file/bot${TOKEN}/${filePath}`;
    const fileResponse = await fetch(downloadUrl);
    if (!fileResponse.ok) return null;

    const buffer = await fileResponse.arrayBuffer();
    fs.writeFileSync(finalPath, Buffer.from(buffer));
    return `images/news/${fileName}`;
  } catch (_e) {
    return null;
  }
}

async function buildIncomingNews(channelPosts) {
  const grouped = new Map();

  channelPosts.forEach((post) => {
    const key = post.media_group_id
      ? `group:${post.media_group_id}`
      : `message:${post.message_id}`;
    const current = grouped.get(key) || [];
    current.push(post);
    grouped.set(key, current);
  });

  const incoming = [];

  for (const postsInGroup of grouped.values()) {
    const sortedGroup = postsInGroup
      .slice()
      .sort((a, b) => Number(a.message_id) - Number(b.message_id));

    const basePost = sortedGroup[0];
    const id = basePost.media_group_id
      ? `group_${basePost.media_group_id}`
      : Number(basePost.message_id);

    const media = [];
    for (const post of sortedGroup) {
      const descriptors = getPostMediaDescriptors(post);
      for (const descriptor of descriptors) {
        const fileName = `${TG_IMAGE_PREFIX}${post.message_id}_${descriptor.type}.jpg`;
        const imagePath = await downloadFile(descriptor.fileId, fileName);
        if (!imagePath) continue;
        media.push({
          type: descriptor.type,
          image: imagePath,
          key: descriptor.key,
        });
      }
    }

    const text =
      sortedGroup.map((post) => post.text || post.caption).find(Boolean) ||
      'Без текста';
    const date = Math.max(...sortedGroup.map((post) => toUnix(post.date)));
    const sourceMessageIds = sortedGroup
      .map((post) => Number(post.message_id))
      .filter(Number.isFinite);

    incoming.push({
      id,
      text,
      date,
      media,
      image: media[0]?.image || null,
      media_count: media.length,
      has_video: media.some((entry) => entry.type === 'video'),
      source_message_ids: sourceMessageIds,
    });
  }

  return incoming;
}

function mergeNews(existingNews, incomingNews) {
  const mergedById = new Map();

  function upsert(item) {
    const prev = mergedById.get(item.id) || {
      id: item.id,
      text: 'Без текста',
      date: 0,
      media: [],
      image: null,
      media_count: 0,
      has_video: false,
      source_message_ids: [],
    };

    const mediaByKey = new Map();
    [...(prev.media || []), ...(item.media || [])].forEach((media) => {
      if (!media || !media.key || !media.image) return;
      mediaByKey.set(media.key, media);
    });
    const media = Array.from(mediaByKey.values());

    const sourceMessageIds = Array.from(
      new Set(
        [...(prev.source_message_ids || []), ...(item.source_message_ids || [])]
          .map(Number)
          .filter(Number.isFinite),
      ),
    );

    mergedById.set(item.id, {
      ...prev,
      ...item,
      text: item.text || prev.text || 'Без текста',
      date: Math.max(toUnix(prev.date), toUnix(item.date)),
      media,
      image: media[0]?.image || null,
      media_count: media.length,
      has_video: media.some((entry) => entry.type === 'video'),
      source_message_ids: sourceMessageIds,
    });
  }

  [...existingNews, ...incomingNews].forEach(upsert);

  return Array.from(mergedById.values())
    .sort((a, b) => toUnix(b.date) - toUnix(a.date))
    .slice(0, MAX_NEWS_ITEMS);
}

function cleanupUnusedTelegramImages(newsItems) {
  if (!fs.existsSync(NEWS_IMAGE_PATH)) return;

  const usedFiles = new Set();
  newsItems.forEach((item) => {
    const media = Array.isArray(item.media) ? item.media : [];
    media.forEach((entry) => {
      if (!entry || typeof entry.image !== 'string') return;
      const filename = path.basename(entry.image);
      if (filename.startsWith(TG_IMAGE_PREFIX)) usedFiles.add(filename);
    });
  });

  fs.readdirSync(NEWS_IMAGE_PATH).forEach((filename) => {
    if (!filename.startsWith(TG_IMAGE_PREFIX)) return;
    if (usedFiles.has(filename)) return;
    try {
      fs.unlinkSync(path.join(NEWS_IMAGE_PATH, filename));
    } catch (_e) {
      // Keep sync resilient in case of fs races.
    }
  });
}

async function fetchTelegramNews() {
  if (!TOKEN) {
    console.error('❌ TG_TOKEN is missing');
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

    const channelPosts = data.result
      .map((item) => item.channel_post)
      .filter((post) => post && String(post.chat.id) === String(CHANNEL_ID));

    ensureDir(DATA_DIR);
    const existingNews = readExistingNews();
    const incomingNews = await buildIncomingNews(channelPosts);
    const mergedNews = mergeNews(existingNews, incomingNews);

    cleanupUnusedTelegramImages(mergedNews);
    writeJson(NEWS_PATH, mergedNews);
    writeState(maxUpdateId);

    const withMediaCount = mergedNews.filter(
      (item) => item.media_count > 0,
    ).length;
    console.log(`✅ Synced. Items with media: ${withMediaCount}`);
  } catch (error) {
    console.error(`❌ Sync error: ${error.message}`);
    process.exit(1);
  }
}

fetchTelegramNews();

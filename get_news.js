const fs = require('fs');
const path = require('path');

const TOKEN = process.env.TG_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID || '-1003859497665';
const NEWS_IMAGE_PATH = './images/news';
const DATA_DIR = './data';
const NEWS_PATH = './data/news.json';
const STATE_PATH = './data/tg_state.json';
const TG_FILE_PREFIX = 'tg_';
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
      photoFileId,
      key: `photo:${post.message_id}:${photoFileId}`,
    });
  }

  if (post.video) {
    media.push({
      type: 'video',
      thumbFileId: getVideoThumbFileId(post.video),
      videoFileId: post.video.file_id || null,
      key: `video:${post.message_id}:${post.video.file_id || 'unknown'}`,
    });
  }

  return media;
}

function pickCoverMedia(mediaList) {
  if (!Array.isArray(mediaList) || !mediaList.length) return null;

  const playableVideo = mediaList.find(
    (entry) =>
      entry &&
      entry.type === 'video' &&
      typeof entry.video === 'string' &&
      entry.video.trim(),
  );
  if (playableVideo) return playableVideo;

  const imageMedia = mediaList.find(
    (entry) => entry && typeof entry.image === 'string' && entry.image.trim(),
  );
  if (imageMedia) return imageMedia;

  return mediaList[0];
}

function normalizeStoredItem(item) {
  if (!item || typeof item !== 'object' || item.id == null) return null;

  const media = Array.isArray(item.media)
    ? item.media
        .filter((entry) => {
          if (!entry || typeof entry !== 'object') return false;
          const hasImage =
            typeof entry.image === 'string' && entry.image.trim();
          const hasVideo =
            typeof entry.video === 'string' && entry.video.trim();
          return hasImage || hasVideo;
        })
        .map((entry) => ({
          type: entry.type === 'video' ? 'video' : 'photo',
          image: typeof entry.image === 'string' ? entry.image : '',
          video: typeof entry.video === 'string' ? entry.video : '',
          key:
            entry.key ||
            `${entry.type || 'photo'}:${entry.image || entry.video || 'legacy'}`,
        }))
    : [];

  if (!media.length) {
    const hasLegacyImage =
      typeof item.image === 'string' && item.image.trim();
    const hasLegacyVideo =
      typeof item.video === 'string' && item.video.trim();
    if (hasLegacyImage || hasLegacyVideo) {
      media.push({
        type: hasLegacyVideo ? 'video' : 'photo',
        image: hasLegacyImage ? item.image : '',
        video: hasLegacyVideo ? item.video : '',
        key: `legacy:${item.id}`,
      });
    }
  }

  const cover = pickCoverMedia(media);
  const sourceMessageIds = Array.isArray(item.source_message_ids)
    ? Array.from(
        new Set(item.source_message_ids.map(Number).filter(Number.isFinite)),
      )
    : [];

  return {
    id: item.id,
    text: typeof item.text === 'string' ? item.text : 'Без текста',
    date: toUnix(item.date),
    media,
    image: cover?.image || null,
    video: cover?.video || null,
    media_count: media.length,
    has_video: media.some((entry) => entry.type === 'video'),
    source_message_ids: sourceMessageIds,
  };
}

function readExistingNews() {
  const parsed = safeReadJson(NEWS_PATH, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.map(normalizeStoredItem).filter(Boolean);
}

async function downloadFile(fileId, fileName) {
  try {
    ensureDir(NEWS_IMAGE_PATH);

    const finalPath = path.join(NEWS_IMAGE_PATH, fileName);
    if (fs.existsSync(finalPath)) {
      return `images/news/${fileName}`;
    }

    const fileMetaResponse = await fetch(
      `https://api.telegram.org/bot${TOKEN}/getFile?file_id=${fileId}`,
    );
    if (!fileMetaResponse.ok) return null;

    const fileMeta = await fileMetaResponse.json();
    if (!fileMeta.ok) return null;

    const filePath = fileMeta.result.file_path;
    const fileResponse = await fetch(
      `https://api.telegram.org/file/bot${TOKEN}/${filePath}`,
    );
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
        if (descriptor.type === 'photo') {
          const imagePath = await downloadFile(
            descriptor.photoFileId,
            `${TG_FILE_PREFIX}${post.message_id}_photo.jpg`,
          );
          if (!imagePath) continue;
          media.push({
            type: 'photo',
            image: imagePath,
            video: '',
            key: descriptor.key,
          });
          continue;
        }

        if (descriptor.type === 'video') {
          let posterPath = '';
          let videoPath = '';

          if (descriptor.thumbFileId) {
            posterPath =
              (await downloadFile(
                descriptor.thumbFileId,
                `${TG_FILE_PREFIX}${post.message_id}_video_poster.jpg`,
              )) || '';
          }

          if (descriptor.videoFileId) {
            videoPath =
              (await downloadFile(
                descriptor.videoFileId,
                `${TG_FILE_PREFIX}${post.message_id}_video.mp4`,
              )) || '';
          }

          if (!posterPath && !videoPath) continue;

          media.push({
            type: 'video',
            image: posterPath,
            video: videoPath,
            key: descriptor.key,
          });
        }
      }
    }

    const text =
      sortedGroup.map((post) => post.text || post.caption).find(Boolean) ||
      'Без текста';
    const date = Math.max(...sortedGroup.map((post) => toUnix(post.date)));
    const sourceMessageIds = sortedGroup
      .map((post) => Number(post.message_id))
      .filter(Number.isFinite);
    const cover = pickCoverMedia(media);

    incoming.push({
      id,
      text,
      date,
      media,
      image: cover?.image || null,
      video: cover?.video || null,
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
      video: null,
      media_count: 0,
      has_video: false,
      source_message_ids: [],
    };

    const mediaByKey = new Map();
    [...(prev.media || []), ...(item.media || [])].forEach((entry) => {
      if (!entry || !entry.key) return;
      const hasImage = typeof entry.image === 'string' && entry.image.trim();
      const hasVideo = typeof entry.video === 'string' && entry.video.trim();
      if (!hasImage && !hasVideo) return;
      mediaByKey.set(entry.key, entry);
    });

    const media = Array.from(mediaByKey.values());
    const cover = pickCoverMedia(media);
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
      image: cover?.image || null,
      video: cover?.video || null,
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

function cleanupUnusedTelegramFiles(newsItems) {
  if (!fs.existsSync(NEWS_IMAGE_PATH)) return;

  const usedFiles = new Set();
  newsItems.forEach((item) => {
    const media = Array.isArray(item.media) ? item.media : [];
    media.forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;

      if (typeof entry.image === 'string' && entry.image.trim()) {
        const imageName = path.basename(entry.image);
        if (imageName.startsWith(TG_FILE_PREFIX)) usedFiles.add(imageName);
      }

      if (typeof entry.video === 'string' && entry.video.trim()) {
        const videoName = path.basename(entry.video);
        if (videoName.startsWith(TG_FILE_PREFIX)) usedFiles.add(videoName);
      }
    });
  });

  fs.readdirSync(NEWS_IMAGE_PATH).forEach((filename) => {
    if (!filename.startsWith(TG_FILE_PREFIX)) return;
    if (usedFiles.has(filename)) return;
    try {
      fs.unlinkSync(path.join(NEWS_IMAGE_PATH, filename));
    } catch (_e) {
      // Keep sync resilient.
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
      (max, item) =>
        Number.isFinite(item.update_id)
          ? Math.max(max, item.update_id)
          : max,
      Number.isFinite(state.lastUpdateId) ? state.lastUpdateId : 0,
    );

    const channelPosts = data.result
      .map((item) => item.channel_post)
      .filter((post) => post && String(post.chat.id) === String(CHANNEL_ID));

    ensureDir(DATA_DIR);
    const existingNews = readExistingNews();
    const incomingNews = await buildIncomingNews(channelPosts);
    const mergedNews = mergeNews(existingNews, incomingNews);

    cleanupUnusedTelegramFiles(mergedNews);
    writeJson(NEWS_PATH, mergedNews);
    writeState(maxUpdateId);

    const withMediaCount = mergedNews.filter((item) => item.media_count > 0).length;
    console.log(`✅ Synced. Items with media: ${withMediaCount}`);
  } catch (error) {
    console.error(`❌ Sync error: ${error.message}`);
    process.exit(1);
  }
}

fetchTelegramNews();

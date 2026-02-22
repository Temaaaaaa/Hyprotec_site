const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

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
const MAX_NEWS_AGE_DAYS =
  Number(process.env.MAX_NEWS_AGE_DAYS) > 0
    ? Number(process.env.MAX_NEWS_AGE_DAYS)
    : 0;
const OPTIMIZE_VIDEOS = String(process.env.OPTIMIZE_VIDEOS || 'true') !== 'false';
const FORCE_RESET = ['1', 'true', 'yes'].includes(
  String(process.env.FORCE_RESET || '').trim().toLowerCase(),
);
const OPTIMIZE_MIN_BYTES =
  Number(process.env.OPTIMIZE_MIN_BYTES) > 0
    ? Number(process.env.OPTIMIZE_MIN_BYTES)
    : 4 * 1024 * 1024;
const MAX_VIDEO_WIDTH =
  Number(process.env.MAX_VIDEO_WIDTH) > 0
    ? Number(process.env.MAX_VIDEO_WIDTH)
    : 1280;
const VIDEO_CRF =
  Number(process.env.VIDEO_CRF) > 0 ? Number(process.env.VIDEO_CRF) : 29;
const VIDEO_PRESET = process.env.VIDEO_PRESET || 'veryfast';

let isFfmpegChecked = false;
let hasFfmpeg = false;

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

function hasNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasImagePath(entry) {
  return Boolean(entry && hasNonEmptyString(entry.image));
}

function hasVideoPath(entry) {
  return Boolean(entry && hasNonEmptyString(entry.video));
}

function isPlayableVideoEntry(entry) {
  return Boolean(entry && entry.type === 'video' && hasVideoPath(entry));
}

function sanitizeText(value, fallback = 'Без текста') {
  return hasNonEmptyString(value) ? value.trim() : fallback;
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

function normalizeSourceMessageIds(values) {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map(Number).filter(Number.isFinite))).sort(
    (a, b) => a - b,
  );
}

function parseSourceMessageIdFromKey(key) {
  if (!hasNonEmptyString(key)) return null;
  const match = /^([a-z_]+):(\d+):/i.exec(key.trim());
  if (!match) return null;
  const parsed = Number(match[2]);
  return Number.isFinite(parsed) ? parsed : null;
}

function toMediaKey(entry) {
  if (hasNonEmptyString(entry?.key)) return entry.key.trim();
  const parsedSourceId = Number(entry?.source_message_id);
  const sourceId = Number.isFinite(parsedSourceId) ? parsedSourceId : 'legacy';
  if (hasVideoPath(entry)) return `video:${sourceId}:${entry.video}`;
  if (hasImagePath(entry)) return `photo:${sourceId}:${entry.image}`;
  return null;
}

function normalizeMediaEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  if (!hasImagePath(entry) && !hasVideoPath(entry)) return null;

  const key = toMediaKey(entry);
  if (!hasNonEmptyString(key)) return null;

  const parsedSourceId = Number(entry.source_message_id);
  const sourceMessageId = Number.isFinite(parsedSourceId)
    ? parsedSourceId
    : parseSourceMessageIdFromKey(key);
  const video = hasVideoPath(entry) ? entry.video : '';
  const image = hasImagePath(entry) ? entry.image : '';

  return {
    type: video ? 'video' : 'photo',
    image,
    video,
    key,
    source_message_id: Number.isFinite(sourceMessageId) ? sourceMessageId : null,
  };
}

function dedupeMediaEntries(entries) {
  const byKey = new Map();
  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    const normalized = normalizeMediaEntry(entry);
    if (!normalized) return;
    byKey.set(normalized.key, normalized);
  });
  return Array.from(byKey.values());
}

function isGroupNewsId(id) {
  return typeof id === 'string' && id.startsWith('group_');
}

function getBotFingerprint(token) {
  if (!hasNonEmptyString(token)) return null;
  return crypto.createHash('sha1').update(token).digest('hex').slice(0, 16);
}

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

function applyAgeLimit(newsItems) {
  if (!(MAX_NEWS_AGE_DAYS > 0)) return newsItems;
  const minTimestamp = nowUnix() - MAX_NEWS_AGE_DAYS * 24 * 60 * 60;
  return newsItems.filter((item) => toUnix(item.date) >= minTimestamp);
}

function finalizeNewsItem(item, fallback = {}) {
  const media = dedupeMediaEntries(item.media);
  const cover = pickCoverMedia(media);
  const sourceMessageIds = normalizeSourceMessageIds([
    ...(fallback.source_message_ids || []),
    ...(item.source_message_ids || []),
    ...media
      .map((entry) => Number(entry.source_message_id))
      .filter(Number.isFinite),
  ]);

  return {
    id: item.id,
    text: sanitizeText(item.text || fallback.text),
    date: Math.max(toUnix(fallback.date), toUnix(item.date)),
    media,
    image: cover?.image || null,
    video: cover?.video || null,
    media_count: media.length,
    has_video: media.some(isPlayableVideoEntry),
    source_message_ids: sourceMessageIds,
  };
}

function readState() {
  const state = safeReadJson(STATE_PATH, {
    lastUpdateId: null,
    channelId: null,
    botFingerprint: null,
  });
  const parsedLastUpdateId = Number(state.lastUpdateId);
  const persistedChannelId = hasNonEmptyString(state.channelId)
    ? String(state.channelId)
    : null;
  const persistedBotFingerprint = hasNonEmptyString(state.botFingerprint)
    ? String(state.botFingerprint)
    : null;
  const currentChannelId = String(CHANNEL_ID);
  const currentBotFingerprint = getBotFingerprint(TOKEN);
  const isSourceChanged =
    (persistedChannelId &&
      persistedChannelId !== currentChannelId) ||
    (persistedBotFingerprint &&
      currentBotFingerprint &&
      persistedBotFingerprint !== currentBotFingerprint);
  if (isSourceChanged) {
    console.log('[info] Telegram source changed, resetting state cursor');
  }

  return {
    lastUpdateId: !FORCE_RESET &&
      !isSourceChanged &&
      Number.isFinite(parsedLastUpdateId)
      ? parsedLastUpdateId
      : null,
    channelId: currentChannelId,
    botFingerprint: currentBotFingerprint,
  };
}

function writeState(lastUpdateId, stateMeta) {
  ensureDir(DATA_DIR);
  writeJson(STATE_PATH, {
    lastUpdateId: Number.isFinite(lastUpdateId) ? lastUpdateId : null,
    channelId: stateMeta?.channelId || String(CHANNEL_ID),
    botFingerprint: stateMeta?.botFingerprint || getBotFingerprint(TOKEN),
    updatedAt: new Date().toISOString(),
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

  const playableVideo = mediaList.find(isPlayableVideoEntry);
  if (playableVideo) return playableVideo;

  const imageMedia = mediaList.find(hasImagePath);
  if (imageMedia) return imageMedia;

  return mediaList[0];
}

function normalizeStoredItem(item) {
  if (!item || typeof item !== 'object' || item.id == null) return null;

  const media = dedupeMediaEntries(item.media);

  if (!media.length) {
    const hasLegacyImage = hasNonEmptyString(item.image);
    const hasLegacyVideo = hasNonEmptyString(item.video);
    if (hasLegacyImage || hasLegacyVideo) {
      media.push({
        type: hasLegacyVideo ? 'video' : 'photo',
        image: hasLegacyImage ? item.image : '',
        video: hasLegacyVideo ? item.video : '',
        key: `legacy:${item.id}`,
        source_message_id: null,
      });
    }
  }

  return finalizeNewsItem({
    id: item.id,
    text: item.text,
    date: item.date,
    media,
    source_message_ids: item.source_message_ids,
  });
}

function readExistingNews() {
  const parsed = safeReadJson(NEWS_PATH, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.map(normalizeStoredItem).filter(Boolean);
}

function ensureFfmpegAvailability() {
  if (isFfmpegChecked) return hasFfmpeg;

  isFfmpegChecked = true;
  const check = spawnSync('ffmpeg', ['-version'], {
    stdio: 'ignore',
    shell: false,
  });
  hasFfmpeg = check.status === 0;

  if (OPTIMIZE_VIDEOS && !hasFfmpeg) {
    console.warn('[warn] ffmpeg not found, video optimization is skipped');
  }

  return hasFfmpeg;
}

function optimizeVideoInPlace(relativePath) {
  if (!OPTIMIZE_VIDEOS || !hasNonEmptyString(relativePath)) return relativePath;
  if (!ensureFfmpegAvailability()) return relativePath;

  const absolutePath = path.resolve(relativePath);
  if (!fs.existsSync(absolutePath)) return relativePath;

  const sourceStat = fs.statSync(absolutePath);
  if (!sourceStat.isFile() || sourceStat.size < OPTIMIZE_MIN_BYTES) {
    return relativePath;
  }

  const outputPath = `${absolutePath}.optimized.mp4`;
  const scaleFilter = `scale=min(iw\\,${MAX_VIDEO_WIDTH}):-2`;

  const result = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      absolutePath,
      '-vf',
      scaleFilter,
      '-c:v',
      'libx264',
      '-preset',
      VIDEO_PRESET,
      '-crf',
      String(VIDEO_CRF),
      '-c:a',
      'aac',
      '-b:a',
      '96k',
      '-movflags',
      '+faststart',
      outputPath,
    ],
    {
      stdio: 'ignore',
      shell: false,
    },
  );

  if (result.status !== 0 || !fs.existsSync(outputPath)) {
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    console.warn(`[warn] ffmpeg optimization failed for ${relativePath}`);
    return relativePath;
  }

  const optimizedStat = fs.statSync(outputPath);
  const keepOriginal =
    !optimizedStat.isFile() ||
    optimizedStat.size === 0 ||
    optimizedStat.size >= sourceStat.size;

  if (keepOriginal) {
    fs.unlinkSync(outputPath);
    return relativePath;
  }

  fs.renameSync(outputPath, absolutePath);
  const savedKb = Math.round((sourceStat.size - optimizedStat.size) / 1024);
  console.log(`[ok] Optimized ${path.basename(relativePath)} (-${savedKb} KB)`);
  return relativePath;
}

async function downloadFile(fileId, fileName) {
  if (!TOKEN || !fileId || !fileName) return null;

  try {
    ensureDir(NEWS_IMAGE_PATH);

    const finalPath = path.join(NEWS_IMAGE_PATH, fileName);
    if (fs.existsSync(finalPath)) {
      return `images/news/${fileName}`;
    }

    const fileMetaResponse = await fetch(
      `https://api.telegram.org/bot${TOKEN}/getFile?file_id=${fileId}`,
    );

    if (!fileMetaResponse.ok) {
      console.warn(
        `[warn] getFile failed for ${fileName}: HTTP ${fileMetaResponse.status}`,
      );
      return null;
    }

    const fileMeta = await fileMetaResponse.json();
    if (!fileMeta.ok) {
      console.warn(
        `[warn] Telegram getFile error for ${fileName}: ${
          fileMeta.description || 'unknown'
        }`,
      );
      return null;
    }

    const filePath = fileMeta?.result?.file_path;
    if (!hasNonEmptyString(filePath)) {
      console.warn(`[warn] Missing file_path for ${fileName}`);
      return null;
    }

    const fileResponse = await fetch(
      `https://api.telegram.org/file/bot${TOKEN}/${filePath}`,
    );

    if (!fileResponse.ok) {
      console.warn(
        `[warn] File download failed for ${fileName}: HTTP ${fileResponse.status}`,
      );
      return null;
    }

    const buffer = await fileResponse.arrayBuffer();
    if (!buffer.byteLength) {
      console.warn(`[warn] Empty file downloaded for ${fileName}`);
      return null;
    }

    fs.writeFileSync(finalPath, Buffer.from(buffer));
    return `images/news/${fileName}`;
  } catch (error) {
    console.warn(`[warn] Download error for ${fileName}: ${error.message}`);
    return null;
  }
}

function dedupeChannelPosts(posts) {
  const byMessageId = new Map();

  posts.forEach((post) => {
    if (!post || typeof post !== 'object') return;

    const messageId = Number(post.message_id);
    if (!Number.isFinite(messageId)) return;

    const prev = byMessageId.get(messageId);
    const prevVersion = prev
      ? Math.max(toUnix(prev.edit_date), toUnix(prev.date))
      : -1;
    const nextVersion = Math.max(toUnix(post.edit_date), toUnix(post.date));

    if (!prev || nextVersion >= prevVersion) {
      byMessageId.set(messageId, post);
    }
  });

  return Array.from(byMessageId.values());
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
            source_message_id: Number(post.message_id),
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

          if (videoPath) {
            videoPath = optimizeVideoInPlace(videoPath);
          }

          if (!posterPath && !videoPath) continue;

          media.push({
            type: videoPath ? 'video' : 'photo',
            image: posterPath,
            video: videoPath,
            key: descriptor.key,
            source_message_id: Number(post.message_id),
          });
        }
      }
    }

    const text =
      sortedGroup
        .map((post) => sanitizeText(post.text || post.caption, ''))
        .find(Boolean) || 'Без текста';
    const date = Math.max(
      ...sortedGroup.map((post) =>
        Math.max(toUnix(post.date), toUnix(post.edit_date)),
      ),
    );
    const sourceMessageIds = normalizeSourceMessageIds(
      sortedGroup.map((post) => Number(post.message_id)),
    );

    incoming.push(
      finalizeNewsItem({
      id,
      text,
      date,
      media,
      source_message_ids: sourceMessageIds,
      }),
    );
  }

  return incoming;
}

function mergeNews(existingNews, incomingNews) {
  const existingById = new Map(
    existingNews.map((item) => [String(item.id), normalizeStoredItem(item)]),
  );
  const incomingById = new Map();

  incomingNews.forEach((rawIncoming) => {
    const incoming = normalizeStoredItem(rawIncoming);
    if (!incoming) return;

    const idKey = String(incoming.id);
    const prev = existingById.get(idKey);
    if (!prev) {
      incomingById.set(idKey, incoming);
      return;
    }

    if (!isGroupNewsId(incoming.id)) {
      incomingById.set(idKey, finalizeNewsItem(incoming));
      return;
    }

    // For media groups, keep untouched messages but replace media for
    // source_message_ids that arrived in this batch.
    const touchedSourceIds = new Set(
      normalizeSourceMessageIds(incoming.source_message_ids),
    );
    const incomingMediaSourceIds = new Set(
      (incoming.media || [])
        .map((entry) => Number(entry.source_message_id))
        .filter(Number.isFinite),
    );
    const preservedPrevMedia = (prev.media || []).filter((entry) => {
      const sourceMessageId = Number(entry.source_message_id);
      if (!Number.isFinite(sourceMessageId)) return true;
      if (!touchedSourceIds.has(sourceMessageId)) return true;
      return !incomingMediaSourceIds.has(sourceMessageId);
    });

    incomingById.set(
      idKey,
      finalizeNewsItem(
        {
          ...incoming,
          text: sanitizeText(incoming.text || prev.text),
          date: Math.max(toUnix(prev.date), toUnix(incoming.date)),
          media: [...preservedPrevMedia, ...(incoming.media || [])],
          source_message_ids: [
            ...(prev.source_message_ids || []),
            ...(incoming.source_message_ids || []),
          ],
        },
        prev,
      ),
    );
  });

  const merged = [
    ...incomingById.values(),
    ...existingNews
      .filter((item) => !incomingById.has(String(item.id)))
      .map(normalizeStoredItem)
      .filter(Boolean),
  ];

  return applyAgeLimit(merged)
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

      if (hasImagePath(entry)) {
        const imageName = path.basename(entry.image);
        if (imageName.startsWith(TG_FILE_PREFIX)) usedFiles.add(imageName);
      }

      if (hasVideoPath(entry)) {
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
    console.error('[error] TG_TOKEN is missing');
    process.exit(1);
  }

  const state = readState();

  try {
    const updates = await fetchTelegramUpdates(state.lastUpdateId);
    const maxUpdateId = updates.reduce(
      (max, item) =>
        Number.isFinite(item.update_id) ? Math.max(max, item.update_id) : max,
      Number.isFinite(state.lastUpdateId) ? state.lastUpdateId : 0,
    );

    if (FORCE_RESET) {
      console.log('[info] FORCE_RESET is enabled');
    }

    const channelPostsRaw = updates
      .flatMap((item) => [item.channel_post, item.edited_channel_post])
      .filter((post) => post && String(post.chat?.id) === String(CHANNEL_ID));
    const channelPosts = dedupeChannelPosts(channelPostsRaw);

    ensureDir(DATA_DIR);
    const existingNews = FORCE_RESET ? [] : readExistingNews();
    const incomingNews = await buildIncomingNews(channelPosts);
    const mergedNews = mergeNews(existingNews, incomingNews);

    cleanupUnusedTelegramFiles(mergedNews);
    writeJson(NEWS_PATH, mergedNews);
    writeState(maxUpdateId, state);

    const withMediaCount = mergedNews.filter(
      (item) => item.media_count > 0,
    ).length;
    console.log(`[ok] Synced. Items with media: ${withMediaCount}`);
  } catch (error) {
    console.error(`[error] Sync failed: ${error.message}`);
    process.exit(1);
  }
}

async function fetchTelegramUpdates(lastUpdateId) {
  const updates = [];
  let offset = Number.isFinite(lastUpdateId) ? lastUpdateId + 1 : null;
  let iterationCount = 0;
  const maxIterations = 50;

  while (iterationCount < maxIterations) {
    iterationCount += 1;
    const params = new URLSearchParams({
      limit: '100',
      allowed_updates: JSON.stringify(['channel_post', 'edited_channel_post']),
    });

    if (Number.isFinite(offset)) {
      params.set('offset', String(offset));
    }

    const url = `https://api.telegram.org/bot${TOKEN}/getUpdates?${params.toString()}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    if (!data.ok) throw new Error(data.description);

    const chunk = Array.isArray(data.result) ? data.result : [];
    if (!chunk.length) break;

    updates.push(...chunk);
    const lastChunkItem = chunk[chunk.length - 1];
    offset = Number.isFinite(lastChunkItem?.update_id)
      ? lastChunkItem.update_id + 1
      : null;

    if (chunk.length < 100 || !Number.isFinite(offset)) break;
  }

  if (iterationCount >= maxIterations) {
    console.warn('[warn] getUpdates pagination hit iteration cap');
  }

  return updates;
}

fetchTelegramNews();

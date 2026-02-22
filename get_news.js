const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const DEFAULT_TEXT = 'Без текста';
const TG_PREFIX = 'tg_';
const CFG = {
  token: process.env.TG_TOKEN,
  channelId: String(process.env.CHANNEL_ID || '-1003859497665'),
  forceReset: bool(process.env.FORCE_RESET, false),
  maxItems: int(process.env.MAX_NEWS_ITEMS, 10),
  maxAgeDays: int(process.env.MAX_NEWS_AGE_DAYS, 0),
  timeoutMs: int(process.env.REQUEST_TIMEOUT_MS, 20000),
  maxPages: int(process.env.MAX_UPDATES_PAGES, 50),
  optimizeVideos: bool(process.env.OPTIMIZE_VIDEOS, true),
  optimizeMinBytes: int(process.env.OPTIMIZE_MIN_BYTES, 4 * 1024 * 1024),
  maxVideoWidth: int(process.env.MAX_VIDEO_WIDTH, 1280),
  videoCrf: int(process.env.VIDEO_CRF, 29),
  videoPreset: String(process.env.VIDEO_PRESET || 'veryfast'),
};
const PATHS = {
  dataDir: './data',
  imagesDir: './images/news',
  news: './data/news.json',
  state: './data/tg_state.json',
};

let ffmpegChecked = false;
let ffmpegOk = false;

function bool(v, fallback = false) {
  if (v == null) return fallback;
  const n = String(v).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(n)) return true;
  if (['0', 'false', 'no', 'off'].includes(n)) return false;
  return fallback;
}
function int(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}
function has(v) {
  return typeof v === 'string' && v.trim().length > 0;
}
function sanitizeText(v, fallback = DEFAULT_TEXT) {
  return has(v) ? v.trim() : fallback;
}
function unix(v) {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return v > 1_000_000_000_000 ? Math.floor(v / 1000) : v;
  }
  if (typeof v === 'string') {
    const n = Number(v.trim());
    if (Number.isFinite(n)) return unix(n);
    const d = Date.parse(v);
    if (!Number.isNaN(d)) return Math.floor(d / 1000);
  }
  return 0;
}
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw || 'null') ?? fallback;
  } catch (_e) {
    return fallback;
  }
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
function uniqNums(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite))).sort(
    (a, b) => a - b,
  );
}
function sourceHash() {
  return crypto.createHash('sha1').update(`${CFG.token || ''}|${CFG.channelId}`).digest('hex').slice(0, 20);
}

function loadState() {
  const state = readJson(PATHS.state, { lastUpdateId: null, sourceHash: null });
  const changed = has(state.sourceHash) && state.sourceHash !== sourceHash();
  const last = Number(state.lastUpdateId);
  if (changed) console.log('[info] Telegram source changed, resetting state.');
  if (CFG.forceReset) console.log('[info] FORCE_RESET enabled.');
  return {
    lastUpdateId: !CFG.forceReset && !changed && Number.isFinite(last) ? last : null,
    sourceHash: sourceHash(),
  };
}
function saveState(lastUpdateId, st) {
  ensureDir(PATHS.dataDir);
  writeJson(PATHS.state, {
    lastUpdateId: Number.isFinite(lastUpdateId) ? lastUpdateId : null,
    sourceHash: st.sourceHash,
    channelId: CFG.channelId,
    updatedAt: new Date().toISOString(),
  });
}

async function tgJson(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(CFG.timeoutMs) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
async function tgBuffer(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(CFG.timeoutMs) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.arrayBuffer();
}

async function fetchUpdates(lastUpdateId) {
  const out = [];
  let offset = Number.isFinite(lastUpdateId) ? lastUpdateId + 1 : null;
  for (let page = 0; page < CFG.maxPages; page += 1) {
    const params = new URLSearchParams({
      limit: '100',
      allowed_updates: JSON.stringify(['channel_post', 'edited_channel_post']),
    });
    if (Number.isFinite(offset)) params.set('offset', String(offset));

    const data = await tgJson(`https://api.telegram.org/bot${CFG.token}/getUpdates?${params.toString()}`);
    if (!data.ok) throw new Error(data.description || 'getUpdates failed');

    const chunk = Array.isArray(data.result) ? data.result : [];
    if (!chunk.length) break;
    out.push(...chunk);

    const last = chunk[chunk.length - 1];
    if (!Number.isFinite(last?.update_id)) break;
    offset = Number(last.update_id) + 1;
    if (chunk.length < 100) break;
  }
  return out;
}

function dedupePosts(posts) {
  const byId = new Map();
  (Array.isArray(posts) ? posts : []).forEach((p) => {
    const id = Number(p?.message_id);
    if (!Number.isFinite(id)) return;
    const prev = byId.get(id);
    const prevVer = prev ? Math.max(unix(prev.date), unix(prev.edit_date)) : -1;
    const nextVer = Math.max(unix(p.date), unix(p.edit_date));
    if (!prev || nextVer >= prevVer) byId.set(id, p);
  });
  return Array.from(byId.values());
}

function mediaKey(m) {
  if (has(m?.key)) return m.key.trim();
  const sid = Number(m?.source_message_id);
  const source = Number.isFinite(sid) ? sid : 'legacy';
  if (has(m?.video)) return `video:${source}:${m.video}`;
  if (has(m?.image)) return `photo:${source}:${m.image}`;
  return null;
}
function sourceIdFromKey(key) {
  if (!has(key)) return null;
  const x = /^([a-z_]+):(\d+):/i.exec(key.trim());
  if (!x) return null;
  const n = Number(x[2]);
  return Number.isFinite(n) ? n : null;
}
function normalizeMedia(m) {
  if (!m || typeof m !== 'object') return null;
  if (!has(m.image) && !has(m.video)) return null;
  const key = mediaKey(m);
  if (!has(key)) return null;
  const sid = Number(m.source_message_id);
  return {
    type: has(m.video) ? 'video' : 'photo',
    image: has(m.image) ? m.image : '',
    video: has(m.video) ? m.video : '',
    key,
    source_message_id: Number.isFinite(sid) ? sid : sourceIdFromKey(key),
  };
}
function dedupeMedia(list) {
  const byKey = new Map();
  (Array.isArray(list) ? list : []).forEach((m) => {
    const n = normalizeMedia(m);
    if (n) byKey.set(n.key, n);
  });
  return Array.from(byKey.values());
}
function pickCover(media) {
  if (!Array.isArray(media) || !media.length) return null;
  const video = media.find((m) => m.type === 'video' && has(m.video));
  if (video) return video;
  const image = media.find((m) => has(m.image));
  if (image) return image;
  return media[0];
}
function isGroupId(id) {
  return typeof id === 'string' && id.startsWith('group_');
}

function finalize(raw, prev = {}) {
  const media = dedupeMedia(raw.media);
  const sourceIds = uniqNums([
    ...(prev.source_message_ids || []),
    ...(raw.source_message_ids || []),
    ...media.map((m) => Number(m.source_message_id)).filter(Number.isFinite),
  ]);
  const cover = pickCover(media);
  const nextText = sanitizeText(raw.text, DEFAULT_TEXT);
  const prevText = sanitizeText(prev.text, DEFAULT_TEXT);
  return {
    id: raw.id,
    text: nextText !== DEFAULT_TEXT ? nextText : prevText,
    date: Math.max(unix(prev.date), unix(raw.date)),
    media,
    image: cover?.image || null,
    video: cover?.video || null,
    media_count: media.length,
    has_video: media.some((m) => m.type === 'video' && has(m.video)),
    source_message_ids: sourceIds,
  };
}

function normalizeStored(item) {
  if (!item || typeof item !== 'object' || item.id == null) return null;
  let media = dedupeMedia(item.media);
  if (!media.length && (has(item.image) || has(item.video))) {
    media = dedupeMedia([
      {
        type: has(item.video) ? 'video' : 'photo',
        image: has(item.image) ? item.image : '',
        video: has(item.video) ? item.video : '',
        key: `legacy:${item.id}`,
        source_message_id: null,
      },
    ]);
  }
  return finalize(
    {
      id: item.id,
      text: item.text,
      date: item.date,
      media,
      source_message_ids: item.source_message_ids,
    },
    {},
  );
}

function loadExistingNews() {
  const parsed = readJson(PATHS.news, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.map(normalizeStored).filter(Boolean);
}

function ensureFfmpeg() {
  if (ffmpegChecked) return ffmpegOk;
  ffmpegChecked = true;
  ffmpegOk = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore', shell: false }).status === 0;
  if (CFG.optimizeVideos && !ffmpegOk) console.warn('[warn] ffmpeg not found, optimization skipped.');
  return ffmpegOk;
}
function optimizeVideo(relPath) {
  if (!CFG.optimizeVideos || !has(relPath) || !ensureFfmpeg()) return relPath;
  const abs = path.resolve(relPath);
  if (!fs.existsSync(abs)) return relPath;
  const src = fs.statSync(abs);
  if (!src.isFile() || src.size < CFG.optimizeMinBytes) return relPath;

  const out = `${abs}.optimized.mp4`;
  const scale = `scale=min(iw\\,${CFG.maxVideoWidth}):-2`;
  const r = spawnSync(
    'ffmpeg',
    [
      '-y', '-i', abs, '-vf', scale,
      '-c:v', 'libx264', '-preset', CFG.videoPreset, '-crf', String(CFG.videoCrf),
      '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', out,
    ],
    { stdio: 'ignore', shell: false },
  );
  if (r.status !== 0 || !fs.existsSync(out)) {
    if (fs.existsSync(out)) fs.unlinkSync(out);
    return relPath;
  }
  const dst = fs.statSync(out);
  if (!dst.isFile() || dst.size <= 0 || dst.size >= src.size) {
    fs.unlinkSync(out);
    return relPath;
  }
  fs.renameSync(out, abs);
  return relPath;
}

async function downloadFile(fileId, outName) {
  if (!CFG.token || !fileId || !outName) return null;
  ensureDir(PATHS.imagesDir);
  const abs = path.join(PATHS.imagesDir, outName);
  if (fs.existsSync(abs)) return `images/news/${outName}`;
  try {
    const meta = await tgJson(`https://api.telegram.org/bot${CFG.token}/getFile?file_id=${fileId}`);
    if (!meta.ok || !has(meta?.result?.file_path)) return null;
    const buffer = await tgBuffer(`https://api.telegram.org/file/bot${CFG.token}/${meta.result.file_path}`);
    if (!buffer.byteLength) return null;
    fs.writeFileSync(abs, Buffer.from(buffer));
    return `images/news/${outName}`;
  } catch (_e) {
    return null;
  }
}

function getDescriptors(post) {
  const out = [];
  const photoId = Array.isArray(post?.photo) && post.photo.length ? post.photo[post.photo.length - 1]?.file_id : null;
  if (photoId) out.push({ type: 'photo', fileId: photoId, key: `photo:${post.message_id}:${photoId}` });
  if (post?.video?.file_id) {
    out.push({
      type: 'video',
      fileId: post.video.file_id,
      thumbId: post.video.thumbnail?.file_id || post.video.thumb?.file_id || null,
      key: `video:${post.message_id}:${post.video.file_id}`,
    });
  }
  return out;
}

function groupText(posts) {
  const sorted = posts
    .slice()
    .sort((a, b) => Math.max(unix(b.date), unix(b.edit_date)) - Math.max(unix(a.date), unix(a.edit_date)));
  return sorted.map((p) => sanitizeText(p.text || p.caption, '')).find(Boolean) || DEFAULT_TEXT;
}

async function buildIncomingNews(posts) {
  const grouped = new Map();
  posts.forEach((p) => {
    const key = p.media_group_id ? `group:${p.media_group_id}` : `message:${p.message_id}`;
    const bucket = grouped.get(key) || [];
    bucket.push(p);
    grouped.set(key, bucket);
  });

  const incoming = [];
  for (const group of grouped.values()) {
    const sorted = group.slice().sort((a, b) => Number(a.message_id) - Number(b.message_id));
    const base = sorted[0];
    const id = base.media_group_id ? `group_${base.media_group_id}` : Number(base.message_id);
    const sourceIds = uniqNums(sorted.map((p) => Number(p.message_id)));
    const media = [];

    for (const post of sorted) {
      for (const d of getDescriptors(post)) {
        if (d.type === 'photo') {
          const image = await downloadFile(d.fileId, `${TG_PREFIX}${post.message_id}_photo.jpg`);
          if (!image) continue;
          media.push({ type: 'photo', image, video: '', key: d.key, source_message_id: Number(post.message_id) });
          continue;
        }

        let poster = '';
        let video = '';
        if (d.thumbId) poster = (await downloadFile(d.thumbId, `${TG_PREFIX}${post.message_id}_video_poster.jpg`)) || '';
        if (d.fileId) video = (await downloadFile(d.fileId, `${TG_PREFIX}${post.message_id}_video.mp4`)) || '';
        if (video) video = optimizeVideo(video);
        if (!poster && !video) continue;

        media.push({
          type: video ? 'video' : 'photo',
          image: poster,
          video,
          key: d.key,
          source_message_id: Number(post.message_id),
        });
      }
    }

    incoming.push(
      finalize(
        {
          id,
          text: groupText(sorted),
          date: Math.max(...sorted.map((p) => Math.max(unix(p.date), unix(p.edit_date)))),
          media,
          source_message_ids: sourceIds,
        },
        {},
      ),
    );
  }

  return incoming;
}

function mergeNews(existing, incoming) {
  const byId = new Map(existing.map((i) => [String(i.id), i]));

  incoming.forEach((raw) => {
    const inc = normalizeStored(raw);
    if (!inc) return;

    const key = String(inc.id);
    const prev = byId.get(key);
    if (!prev) {
      byId.set(key, inc);
      return;
    }

    const touched = new Set(uniqNums(inc.source_message_ids));
    const incomingMediaSource = new Set((inc.media || []).map((m) => Number(m.source_message_id)).filter(Number.isFinite));

    const keepPrevMedia = (m) => {
      const sid = Number(m.source_message_id);
      if (!Number.isFinite(sid)) return true;
      if (!touched.has(sid)) return true;
      return !incomingMediaSource.has(sid);
    };

    const prevKeep = (prev.media || []).filter(keepPrevMedia);
    const mergedMedia = isGroupId(inc.id) || (inc.media || []).length > 0 ? [...prevKeep, ...(inc.media || [])] : prev.media || [];

    byId.set(
      key,
      finalize(
        {
          id: inc.id,
          text: inc.text || prev.text,
          date: Math.max(unix(prev.date), unix(inc.date)),
          media: mergedMedia,
          source_message_ids: [...(prev.source_message_ids || []), ...(inc.source_message_ids || [])],
        },
        prev,
      ),
    );
  });

  let out = Array.from(byId.values());
  if (CFG.maxAgeDays > 0) {
    const minTs = Math.floor(Date.now() / 1000) - CFG.maxAgeDays * 24 * 60 * 60;
    out = out.filter((n) => unix(n.date) >= minTs);
  }
  return out.sort((a, b) => unix(b.date) - unix(a.date)).slice(0, CFG.maxItems);
}

function cleanupUnusedFiles(news) {
  if (!fs.existsSync(PATHS.imagesDir)) return;

  const used = new Set();
  news.forEach((n) => {
    (Array.isArray(n.media) ? n.media : []).forEach((m) => {
      if (has(m.image)) {
        const name = path.basename(m.image);
        if (name.startsWith(TG_PREFIX)) used.add(name);
      }
      if (has(m.video)) {
        const name = path.basename(m.video);
        if (name.startsWith(TG_PREFIX)) used.add(name);
      }
    });
  });

  fs.readdirSync(PATHS.imagesDir).forEach((name) => {
    if (!name.startsWith(TG_PREFIX)) return;
    if (used.has(name)) return;
    try { fs.unlinkSync(path.join(PATHS.imagesDir, name)); } catch (_e) {}
  });
}

async function main() {
  if (!CFG.token) {
    console.error('[error] TG_TOKEN is missing');
    process.exit(1);
  }

  const state = loadState();
  try {
    const updates = await fetchUpdates(state.lastUpdateId);
    const maxUpdateId = updates.reduce(
      (max, u) => (Number.isFinite(u?.update_id) ? Math.max(max, Number(u.update_id)) : max),
      Number.isFinite(state.lastUpdateId) ? state.lastUpdateId : 0,
    );

    const rawPosts = updates
      .flatMap((u) => [u.channel_post, u.edited_channel_post])
      .filter((p) => p && String(p.chat?.id) === CFG.channelId);

    const posts = dedupePosts(rawPosts);
    const existing = CFG.forceReset ? [] : loadExistingNews();
    const incoming = await buildIncomingNews(posts);
    const merged = mergeNews(existing, incoming);

    ensureDir(PATHS.dataDir);
    writeJson(PATHS.news, merged);
    cleanupUnusedFiles(merged);
    saveState(maxUpdateId, state);

    console.log(`[ok] Synced ${merged.length} item(s)`);
  } catch (error) {
    console.error(`[error] Sync failed: ${error.message}`);
    process.exit(1);
  }
}

main();

const GRAPH_BASE = 'https://graph.instagram.com';
const GRAPH_VERSION = 'v25.0';

const mediaTypeMap = { IMAGE: 'Image', VIDEO: 'Video', CAROUSEL_ALBUM: 'Sidecar' };

function extractShortCode(permalink) {
  const match = permalink.match(/\/(?:p|reel|reels|tv)\/([^/?]+)/);
  return match?.[1] ?? '';
}

function extractHashtags(caption) {
  return caption.match(/#[\w\u00C0-\u024F\u1E00-\u1EFF]+/g) ?? [];
}

function metaHeaders(token, extra = {}) {
  return { Authorization: `Bearer ${token}`, ...extra };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const circuitBreaker = { failures: 0, lastFailure: 0, isOpen: false, threshold: 5, resetTimeout: 60000 };

function checkCircuitBreaker() {
  if (!circuitBreaker.isOpen) return true;
  if (Date.now() - circuitBreaker.lastFailure > circuitBreaker.resetTimeout) {
    circuitBreaker.isOpen = false;
    circuitBreaker.failures = 0;
    return true;
  }
  return false;
}

function recordFailure() {
  circuitBreaker.failures++;
  circuitBreaker.lastFailure = Date.now();
  if (circuitBreaker.failures >= circuitBreaker.threshold) circuitBreaker.isOpen = true;
}

function recordSuccess() {
  circuitBreaker.failures = Math.max(0, circuitBreaker.failures - 1);
}

const apiCache = new Map();
const CACHE_TTL_SHORT = 5 * 60 * 1000;
const CACHE_TTL_LONG = 60 * 60 * 1000;

function getCached(key, ttl) {
  const e = apiCache.get(key);
  if (!e) return null;
  if (Date.now() - e.timestamp > ttl) { apiCache.delete(key); return null; }
  return e.data;
}

function setCache(key, data) {
  apiCache.set(key, { data, timestamp: Date.now() });
  if (apiCache.size > 200) {
    const oldest = [...apiCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
    for (let i = 0; i < 50; i++) apiCache.delete(oldest[i][0]);
  }
}

async function fetchWithRetry(url, init, maxRetries = 2) {
  if (!checkCircuitBreaker()) throw new Error('Circuit breaker aberto.');
  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, init);
    if (res.status !== 429) { recordSuccess(); return res; }
    const waitMs = Math.min(1000 * 2 ** attempt, 10000);
    lastError = new Error('Rate limited');
    await sleep(waitMs);
  }
  recordFailure();
  throw lastError;
}

async function fetchInstagramInsights(token, limit = 50) {
  const mediaUrl = `${GRAPH_BASE}/${GRAPH_VERSION}/me/media?fields=id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count,username&limit=${limit}`;
  const mediaRes = await fetchWithRetry(mediaUrl, { headers: metaHeaders(token) });
  const mediaData = await mediaRes.json();
  if (mediaData.error) throw new Error(`Meta API: ${mediaData.error.message}`);
  if (!mediaData.data || !Array.isArray(mediaData.data)) throw new Error('Meta API: resposta inesperada');

  const posts = [];
  for (let i = 0; i < mediaData.data.length; i++) {
    const item = mediaData.data[i];
    const productType = item.media_product_type || (item.media_type === 'VIDEO' ? 'REELS' : 'FEED');
    const post = {
      id: item.id,
      shortCode: extractShortCode(item.permalink),
      url: item.permalink,
      type: mediaTypeMap[item.media_type] ?? 'Image',
      caption: item.caption ?? '',
      hashtags: extractHashtags(item.caption ?? ''),
      likesCount: item.like_count ?? 0,
      commentsCount: item.comments_count ?? 0,
      videoViewCount: null,
      videoPlayCount: null,
      timestamp: item.timestamp,
      displayUrl: (item.media_type === 'VIDEO' ? item.thumbnail_url ?? item.media_url : item.media_url ?? item.thumbnail_url) ?? '',
      ownerUsername: item.username ?? '',
      latestComments: [],
      reach: 0, saved: 0, shares: 0, totalInteractions: 0,
      source: 'meta',
      media_product_type: productType,
    };

    try {
      let metricsParam;
      if (productType === 'STORY') metricsParam = 'reach,views,shares,replies,follows,profile_visits';
      else if (productType === 'REELS') metricsParam = 'reach,saved,shares,views,total_interactions,ig_reels_avg_watch_time';
      else metricsParam = 'reach,saved,shares,views,total_interactions,follows,profile_visits';

      const insightsRes = await fetchWithRetry(`${GRAPH_BASE}/${GRAPH_VERSION}/${item.id}/insights?metric=${metricsParam}`, { headers: metaHeaders(token) });
      const insightsData = await insightsRes.json();
      if (insightsData.data && Array.isArray(insightsData.data)) {
        const im = {};
        insightsData.data.forEach((insight) => {
          const val = insight.values?.[0]?.value ?? insight.value ?? 0;
          im[insight.name] = typeof val === 'number' ? val : 0;
        });
        post.reach = im['reach'] ?? 0;
        post.saved = im['saved'] ?? 0;
        post.shares = im['shares'] ?? 0;
        post.totalInteractions = im['total_interactions'] ?? 0;
        if (im['views'] != null) post.videoViewCount = im['views'];
        if (im['ig_reels_avg_watch_time'] != null) post.ig_reels_avg_watch_time = im['ig_reels_avg_watch_time'];
      }
    } catch (e) {
      console.warn(`[MetaGraph] Insights erro ${item.id}:`, e.message);
    }

    if (post.reach > 0) {
      post.engagementRate = ((post.likesCount + post.commentsCount + post.saved + post.shares) / post.reach) * 100;
    }
    posts.push(post);
    if (i < mediaData.data.length - 1) await sleep(100);
  }
  return posts;
}

async function fetchPostComments(token, shortCodes, sinceUnix) {
  const mediaItems = [];
  let nextUrl = `${GRAPH_BASE}/${GRAPH_VERSION}/me/media?fields=id,permalink&limit=50`;
  let pages = 0;
  while (nextUrl && pages < 5) {
    const r = await fetch(nextUrl, { headers: metaHeaders(token) });
    const d = await r.json();
    if (d.error) throw new Error(`Meta API: ${d.error.message}`);
    for (const item of d.data ?? []) {
      const sc = extractShortCode(item.permalink);
      if (!shortCodes || shortCodes.includes(sc)) mediaItems.push({ id: item.id, shortCode: sc });
    }
    nextUrl = d.paging?.next ?? null;
    pages++;
    if (shortCodes && mediaItems.length >= shortCodes.length) break;
  }
  const results = [];
  const sinceParam = sinceUnix ? `&since=${sinceUnix}` : `&since=${Math.floor((Date.now() - 48 * 3600000) / 1000)}`;
  for (const media of mediaItems) {
    try {
      const allComments = [];
      let commentNextUrl = `${GRAPH_BASE}/${GRAPH_VERSION}/${media.id}/comments?fields=id,text,username,timestamp,like_count&limit=50${sinceParam}`;
      let cp = 0;
      while (commentNextUrl && cp < 3) {
        const cr = await fetch(commentNextUrl, { headers: metaHeaders(token) });
        const cd = await cr.json();
        if (cd.error || !Array.isArray(cd.data)) break;
        allComments.push(...cd.data.map((c) => ({ id: c.id, text: c.text, ownerUsername: c.username, timestamp: c.timestamp, likesCount: c.like_count ?? 0 })));
        commentNextUrl = cd.paging?.next ?? null;
        cp++;
      }
      allComments.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      results.push({ shortCode: media.shortCode, comments: allComments });
    } catch {}
  }
  return results;
}

async function verifyMetaToken(token) {
  try {
    const res = await fetch(`${GRAPH_BASE}/${GRAPH_VERSION}/me?fields=username,followers_count,follows_count,media_count,name,biography,profile_picture_url,website`, { headers: metaHeaders(token) });
    const data = await res.json();
    if (data.error) return { valid: false };
    return { valid: true, username: data.username, followersCount: data.followers_count, name: data.name, biography: data.biography, profilePictureUrl: data.profile_picture_url, followsCount: data.follows_count, mediaCount: data.media_count, website: data.website };
  } catch { return { valid: false }; }
}

async function refreshMetaToken(token) {
  try {
    const res = await fetch(`${GRAPH_BASE}/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`);
    const data = await res.json();
    if (data.error || !data.access_token) return null;
    return { access_token: data.access_token, expires_in: data.expires_in };
  } catch { return null; }
}

async function fetchAccountInsights(token, userId, days = 30) {
  const unixNow = Math.floor(Date.now() / 1000);
  const unixSince = Math.floor((Date.now() - days * 86400000) / 1000);
  const metrics = 'reach,views,accounts_engaged,total_interactions,likes,comments,saves,shares,follows_and_unfollows,profile_links_taps';
  const url = `${GRAPH_BASE}/${GRAPH_VERSION}/${userId}/insights?metric=${metrics}&period=day&since=${unixSince}&until=${unixNow}`;
  const res = await fetch(url, { headers: metaHeaders(token) });
  const data = await res.json();
  if (data.error || !data.data) return [];
  const dailyMap = {};
  data.data.forEach((mg) => {
    mg.values?.forEach((val) => {
      const d = val.end_time.substring(0, 10);
      if (!dailyMap[d]) dailyMap[d] = { date: d, reach: 0, views: 0, accountsEngaged: 0, totalInteractions: 0, likes: 0, comments: 0, saves: 0, shares: 0, followsNet: 0, profileLinksTaps: 0 };
      const v = val.value ?? 0;
      switch (mg.name) {
        case 'reach': dailyMap[d].reach = v; break;
        case 'views': dailyMap[d].views = v; break;
        case 'accounts_engaged': dailyMap[d].accountsEngaged = v; break;
        case 'total_interactions': dailyMap[d].totalInteractions = v; break;
        case 'likes': dailyMap[d].likes = v; break;
        case 'comments': dailyMap[d].comments = v; break;
        case 'saves': dailyMap[d].saves = v; break;
        case 'shares': dailyMap[d].shares = v; break;
        case 'follows_and_unfollows': dailyMap[d].followsNet = typeof v === 'object' ? (v.FOLLOW ?? 0) - (v.UNFOLLOW ?? 0) : v; break;
        case 'profile_links_taps': dailyMap[d].profileLinksTaps = v; break;
      }
    });
  });
  return Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchDemographicBreakdown(token, userId, metric, breakdown) {
  const url = `${GRAPH_BASE}/${GRAPH_VERSION}/${userId}/insights?metric=${metric}&period=lifetime&timeframe=last_30_days&breakdown=${breakdown}&metric_type=total_value`;
  try {
    const res = await fetch(url, { headers: metaHeaders(token) });
    const data = await res.json();
    if (data.error || !data.data?.length) return [];
    const results = data.data[0]?.total_value?.breakdowns?.[0]?.results;
    if (!results) return [];
    return results.map((r) => ({ label: r.dimension_values?.join(', ') ?? '?', count: r.value ?? 0 })).sort((a, b) => b.count - a.count);
  } catch { return []; }
}

async function fetchAudienceDemographics(token, userId) {
  const empty = { followers: { age: [], gender: [], city: [], country: [] }, engaged: { age: [], gender: [], city: [], country: [] } };
  try {
    const [fA, fG, fC, fCo, eA, eG, eC, eCo] = await Promise.all([
      fetchDemographicBreakdown(token, userId, 'follower_demographics', 'age'),
      fetchDemographicBreakdown(token, userId, 'follower_demographics', 'gender'),
      fetchDemographicBreakdown(token, userId, 'follower_demographics', 'city'),
      fetchDemographicBreakdown(token, userId, 'follower_demographics', 'country'),
      fetchDemographicBreakdown(token, userId, 'engaged_audience_demographics', 'age'),
      fetchDemographicBreakdown(token, userId, 'engaged_audience_demographics', 'gender'),
      fetchDemographicBreakdown(token, userId, 'engaged_audience_demographics', 'city'),
      fetchDemographicBreakdown(token, userId, 'engaged_audience_demographics', 'country'),
    ]);
    return { followers: { age: fA, gender: fG, city: fC, country: fCo }, engaged: { age: eA, gender: eG, city: eC, country: eCo } };
  } catch { return empty; }
}

async function fetchBusinessDiscovery(token, userId, targetUsername) {
  const fields = 'username,name,biography,followers_count,follows_count,media_count,profile_picture_url,media.limit(25){id,caption,media_type,like_count,comments_count,timestamp,permalink,media_url}';
  const url = `${GRAPH_BASE}/${GRAPH_VERSION}/${userId}?fields=business_discovery.username(${targetUsername}){${fields}}`;
  const res = await fetch(url, { headers: metaHeaders(token) });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  const bd = data.business_discovery;
  if (!bd) return null;
  return { username: bd.username, name: bd.name, biography: bd.biography, followersCount: bd.followers_count || 0, followsCount: bd.follows_count || 0, mediaCount: bd.media_count || 0, profilePictureUrl: bd.profile_picture_url, posts: bd.media?.data || [] };
}

async function replyToComment(token, commentId, message) {
  try {
    const res = await fetch(`${GRAPH_BASE}/${GRAPH_VERSION}/${commentId}/replies`, { method: 'POST', headers: metaHeaders(token, { 'Content-Type': 'application/json' }), body: JSON.stringify({ message }) });
    const data = await res.json();
    if (data.error) return { success: false, error: data.error.message };
    return { success: true, id: data.id };
  } catch (e) { return { success: false, error: e.message }; }
}

async function hideComment(token, commentId) {
  try {
    const res = await fetch(`${GRAPH_BASE}/${GRAPH_VERSION}/${commentId}?hide=true`, { method: 'POST', headers: metaHeaders(token) });
    const data = await res.json();
    return data.error ? { success: false, error: data.error.message } : { success: true };
  } catch (e) { return { success: false, error: e.message }; }
}

async function deleteComment(token, commentId) {
  try {
    const res = await fetch(`${GRAPH_BASE}/${GRAPH_VERSION}/${commentId}`, { method: 'DELETE', headers: metaHeaders(token) });
    const data = await res.json();
    return data.error ? { success: false, error: data.error.message } : { success: true };
  } catch (e) { return { success: false, error: e.message }; }
}

async function getInstagramUserId(token) {
  try {
    const res = await fetch(`${GRAPH_BASE}/${GRAPH_VERSION}/me?fields=id`, { headers: metaHeaders(token) });
    const data = await res.json();
    return data.id || null;
  } catch { return null; }
}

async function publishImage(token, userId, imageUrl, caption) {
  try {
    const createRes = await fetch(`${GRAPH_BASE}/${GRAPH_VERSION}/${userId}/media?image_url=${encodeURIComponent(imageUrl)}&caption=${encodeURIComponent(caption)}`, { method: 'POST', headers: metaHeaders(token) });
    const createData = await createRes.json();
    if (createData.error) return { success: false, error: createData.error.message };
    const containerId = createData.id;
    if (!containerId) return { success: false, error: 'Container nao criado.' };
    let ready = false, attempts = 0;
    while (!ready && attempts < 10) {
      attempts++; await sleep(3000);
      const sr = await fetch(`${GRAPH_BASE}/${GRAPH_VERSION}/${containerId}?fields=status_code`, { headers: metaHeaders(token) });
      const sd = await sr.json();
      if (sd.status_code === 'FINISHED') ready = true;
      else if (sd.status_code === 'ERROR') return { success: false, error: 'Erro no processamento.' };
    }
    const pubRes = await fetch(`${GRAPH_BASE}/${GRAPH_VERSION}/${userId}/media_publish?creation_id=${containerId}`, { method: 'POST', headers: metaHeaders(token) });
    const pubData = await pubRes.json();
    if (pubData.error) return { success: false, error: pubData.error.message };
    return { success: true, id: pubData.id };
  } catch (e) { return { success: false, error: e.message }; }
}

async function publishVideo(token, userId, videoUrl, caption, isReel = false) {
  try {
    const mediaType = isReel ? 'REELS' : 'VIDEO';
    const createRes = await fetch(`${GRAPH_BASE}/${GRAPH_VERSION}/${userId}/media?video_url=${encodeURIComponent(videoUrl)}&media_type=${mediaType}&caption=${encodeURIComponent(caption)}`, { method: 'POST', headers: metaHeaders(token) });
    const createData = await createRes.json();
    if (createData.error) return { success: false, error: createData.error.message };
    const containerId = createData.id;
    if (!containerId) return { success: false, error: 'Container nao criado.' };
    let ready = false, attempts = 0;
    while (!ready && attempts < 20) {
      attempts++; await sleep(15000);
      const sr = await fetch(`${GRAPH_BASE}/${GRAPH_VERSION}/${containerId}?fields=status_code,error_message`, { headers: metaHeaders(token) });
      const sd = await sr.json();
      if (sd.status_code === 'FINISHED') ready = true;
      else if (sd.status_code === 'ERROR') return { success: false, error: sd.error_message || 'Erro no video' };
      else if (sd.error?.code === 4) await sleep(30000);
    }
    if (!ready) return { success: false, error: 'Timeout no processamento do video.' };
    const pubRes = await fetch(`${GRAPH_BASE}/${GRAPH_VERSION}/${userId}/media_publish?creation_id=${containerId}`, { method: 'POST', headers: metaHeaders(token) });
    const pubData = await pubRes.json();
    if (pubData.error) return { success: false, error: pubData.error.message };
    return { success: true, id: pubData.id };
  } catch (e) { return { success: false, error: e.message }; }
}

async function publishReel(token, userId, videoUrl, caption) {
  return publishVideo(token, userId, videoUrl, caption, true);
}

async function publishStory(token, userId, mediaUrl) {
  try {
    const isVideo = mediaUrl.toLowerCase().match(/\.(mp4|mov|avi|wmv|m4v)$/i);
    const param = isVideo ? `video_url=${encodeURIComponent(mediaUrl)}` : `image_url=${encodeURIComponent(mediaUrl)}`;
    const createRes = await fetch(`${GRAPH_BASE}/${GRAPH_VERSION}/${userId}/media?media_type=STORIES&${param}`, { method: 'POST', headers: metaHeaders(token) });
    const createData = await createRes.json();
    if (createData.error) return { success: false, error: createData.error.message };
    const containerId = createData.id;
    if (!containerId) return { success: false, error: 'Container nao criado.' };
    let ready = false, attempts = 0;
    while (!ready && attempts < (isVideo ? 20 : 10)) {
      attempts++; await sleep(isVideo ? 15000 : 8000);
      const sr = await fetch(`${GRAPH_BASE}/${GRAPH_VERSION}/${containerId}?fields=status_code,error_message`, { headers: metaHeaders(token) });
      const sd = await sr.json();
      if (sd.status_code === 'FINISHED') ready = true;
      else if (sd.status_code === 'ERROR') return { success: false, error: sd.error_message || 'Erro no story' };
      else if (sd.error?.code === 4) await sleep(30000);
    }
    if (!ready) return { success: false, error: 'Timeout no processamento do story.' };
    const pubRes = await fetch(`${GRAPH_BASE}/${GRAPH_VERSION}/${userId}/media_publish?creation_id=${containerId}`, { method: 'POST', headers: metaHeaders(token) });
    const pubData = await pubRes.json();
    if (pubData.error) return { success: false, error: pubData.error.message };
    return { success: true, id: pubData.id };
  } catch (e) { return { success: false, error: e.message }; }
}

async function publishCarousel(token, userId, imageUrls, caption) {
  try {
    const itemIds = [];
    for (const url of imageUrls) {
      const isV = url.toLowerCase().match(/\.(mp4|mov|avi|wmv|m4v)$/i);
      const p = isV ? `video_url=${encodeURIComponent(url)}&media_type=VIDEO` : `image_url=${encodeURIComponent(url)}&media_type=IMAGE`;
      const r = await fetch(`${GRAPH_BASE}/${GRAPH_VERSION}/${userId}/media?${p}&is_carousel_item=true`, { method: 'POST', headers: metaHeaders(token) });
      const d = await r.json();
      if (d.error) return { success: false, error: `Item ${url}: ${d.error.message}` };
      itemIds.push(d.id);
    }
    await sleep(3000);
    const cr = await fetch(`${GRAPH_BASE}/${GRAPH_VERSION}/${userId}/media?media_type=CAROUSEL&children=${itemIds.join(',')}&caption=${encodeURIComponent(caption)}`, { method: 'POST', headers: metaHeaders(token) });
    const cd = await cr.json();
    if (cd.error) return { success: false, error: cd.error.message };
    let ready = false, attempts = 0;
    while (!ready && attempts < 10) {
      attempts++; await sleep(3000);
      const sr = await fetch(`${GRAPH_BASE}/${GRAPH_VERSION}/${cd.id}?fields=status_code,error_message`, { headers: metaHeaders(token) });
      const sd = await sr.json();
      if (sd.status_code === 'FINISHED') ready = true;
      else if (sd.status_code === 'ERROR') return { success: false, error: sd.error_message || 'Erro no carrossel' };
    }
    const pr = await fetch(`${GRAPH_BASE}/${GRAPH_VERSION}/${userId}/media_publish?creation_id=${cd.id}`, { method: 'POST', headers: metaHeaders(token) });
    const pd = await pr.json();
    if (pd.error) return { success: false, error: pd.error.message };
    return { success: true, id: pd.id };
  } catch (e) { return { success: false, error: e.message }; }
}

async function fetchCarouselChildren(token, mediaId) {
  const ck = `children:${mediaId}`;
  const cached = getCached(ck, CACHE_TTL_LONG);
  if (cached) return cached;
  try {
    const res = await fetchWithRetry(`${GRAPH_BASE}/${GRAPH_VERSION}/${mediaId}/children?fields=id,media_type,media_url,timestamp`, { headers: metaHeaders(token) });
    const data = await res.json();
    if (data.error || !data.data) return [];
    setCache(ck, data.data);
    return data.data;
  } catch { return []; }
}

async function fetchOnlineFollowers(token, userId) {
  const ck = `online_followers:${userId}`;
  const cached = getCached(ck, CACHE_TTL_LONG);
  if (cached) return cached;
  try {
    const res = await fetchWithRetry(`${GRAPH_BASE}/${GRAPH_VERSION}/${userId}/insights?metric=online_followers&period=lifetime`, { headers: metaHeaders(token) });
    const data = await res.json();
    if (data.error || !data.data?.length) return null;
    const values = data.data[0]?.values?.[0]?.value;
    if (!values || typeof values !== 'object') return null;
    const hourlyBreakdown = [];
    let peakHour = 0, peakCount = 0;
    for (const [h, c] of Object.entries(values)) {
      const hour = parseInt(h), count = typeof c === 'number' ? c : 0;
      hourlyBreakdown.push({ hour, count });
      if (count > peakCount) { peakCount = count; peakHour = hour; }
    }
    hourlyBreakdown.sort((a, b) => a.hour - b.hour);
    const result = { hourlyBreakdown, peakHour, peakCount };
    setCache(ck, result);
    return result;
  } catch { return null; }
}

async function fetchTaggedMedia(token, userId, limit = 25) {
  const ck = `tagged:${userId}`;
  const cached = getCached(ck, CACHE_TTL_SHORT);
  if (cached) return cached;
  try {
    const res = await fetchWithRetry(`${GRAPH_BASE}/${GRAPH_VERSION}/${userId}/tags?fields=id,caption,media_type,permalink,timestamp,username&limit=${limit}`, { headers: metaHeaders(token) });
    const data = await res.json();
    if (data.error || !data.data) return [];
    setCache(ck, data.data);
    return data.data;
  } catch { return []; }
}

async function fetchActiveStories(token, userId) {
  try {
    const res = await fetchWithRetry(`${GRAPH_BASE}/${GRAPH_VERSION}/${userId}/stories?fields=id,media_type,media_url,timestamp,permalink`, { headers: metaHeaders(token) });
    const data = await res.json();
    if (data.error || !data.data) return [];
    return data.data;
  } catch { return []; }
}

function clearApiCache() { apiCache.clear(); }
function getApiCacheStats() { return { size: apiCache.size, entries: [...apiCache.keys()] }; }

module.exports = {
  fetchInstagramInsights, fetchPostComments, verifyMetaToken, refreshMetaToken,
  fetchAccountInsights, fetchAudienceDemographics, fetchBusinessDiscovery,
  replyToComment, hideComment, deleteComment, getInstagramUserId,
  publishImage, publishVideo, publishReel, publishStory, publishCarousel,
  fetchCarouselChildren, fetchOnlineFollowers, fetchTaggedMedia, fetchActiveStories,
  clearApiCache, getApiCacheStats,
};

/**
 * LanguoAI / HGhub HPP 1.0 — experimental website source
 * Target: https://languo.ai/
 * Capabilities: home, catalog, bounded catalog-index search, media detail, episode links.
 * Playback: directly embedded public HLS/MP4 when present; otherwise external webpage.
 * IMPORTANT: Web playback fallback is NOT native HGhub video playback.
 * This source does not bypass login, DRM or paid access.
 */
export const meta = {
  id: 'community.languo.web',
  name: '蓝果短剧（网页测试版）',
  version: '0.2.0',
  protocol: 1,
  kind: 'source',
  mature: true,
  author: 'Community prototype',
  description: '蓝果网页目录/搜索结果页/分集入口；优先识别页面明示的 HLS/MP4，无法获取时通过浏览器打开原站。尚未完成 HGhub 实机验证。',
  homepage: 'https://languo.ai/',
  updateUrl: 'https://raw.githubusercontent.com/eddiexie1026/HGhub-Languo/main/languo-hghub-source.js',
  linkDomains: ['languo.ai', 'www.languo.ai'],
  requires: [{ type: 'api', name: 'html.parse' }],
  defaultHeaders: { Referer: 'https://languo.ai/' },
  timeouts: { read: 25, playback: 30 },
  settings: [
    { key: 'externalOnly', type: 'switch', label: '始终使用网页播放', default: false }
  ]
};

export default function(hg) {
  const BASE = 'https://languo.ai';
  const ROOTS = {
    duanju: '/duanju/',
    original: '/original/',
    gv: '/gv/'
  };
  const headers = { Accept: 'text/html,application/xhtml+xml', Referer: BASE + '/' };

  const absolute = (value) => {
    const raw = String(value || '').trim();
    if (!raw || raw.startsWith('data:') || raw.startsWith('javascript:')) return '';
    if (/^https:\/\//i.test(raw)) return raw;
    if (/^\/\//.test(raw)) return 'https:' + raw;
    if (raw.startsWith('/')) return BASE + raw;
    if (/^[\w.-]+\.[a-z]{2,}\//i.test(raw)) return 'https://' + raw;
    return BASE + '/' + raw.replace(/^\.\//, '');
  };
  const mediaIdFromUrl = (url) => {
    const m = String(url || '').match(/\/video\/(\d+)(?:\/|$|\?)/);
    return m ? m[1] : null;
  };
  const episodeFromUrl = (url, mediaId) => {
    const input = String(url || '');
    const m = input.match(/\/video\/(\d+)\/(?:ep-(\d+)\/?)?(?:[?#]|$)/);
    if (!m || m[1] !== String(mediaId)) return null;
    return m[2] ? String(Number(m[2])) : '1';
  };
  const episodePage = (id, ep) => {
    const n = Number(ep);
    if (!/^\d+$/.test(String(id)) || !Number.isSafeInteger(n) || n < 1) {
      throw new hg.PluginError('INVALID_ARGUMENT', '不是有效的作品/分集编号');
    }
    return BASE + '/video/' + id + (n === 1 ? '/' : '/ep-' + n + '/');
  };

  async function requestHtml(url, ctx) {
    const res = await hg.http.fetch({
      url, responseType: 'text', headers, signal: ctx && ctx.signal,
      timeoutMs: 12000, maxBytes: 2 * 1024 * 1024,
      cache: { ttlSec: 90 }
    });
    if (!res.ok) {
      throw new hg.PluginError('UPSTREAM_ERROR', '蓝果站点返回 HTTP ' + res.status);
    }
    if (typeof res.data !== 'string' || !res.data.includes('<')) {
      throw new hg.PluginError('UPSTREAM_CHANGED', '网站没有返回可解析的 HTML 页面');
    }
    return { html: res.data, doc: hg.html.parse(res.data) };
  }

  function firstImage(node) {
    const img = node.first('img');
    if (!img) return '';
    const src = img.attr('data-src') || img.attr('data-original') || img.attr('src') || '';
    return absolute(src);
  }
  function titleFromAnchor(a) {
    // Prefer a semantic heading or image alternative text over rating/badge text.
    const heading = a.first('h3') || a.first('h2') || a.first('h4');
    if (heading && heading.text().trim()) return heading.text().trim();
    const img = a.first('img');
    if (img && img.attr('alt') && img.attr('alt').trim()) return img.attr('alt').trim();
    return a.text()
      .replace(/^(?:原创新剧|原创|新剧|热门|更新|推荐)+/g, '')
      .replace(/^\s*\d+(?:\.\d+)?\s*分\s*/g, '')
      .replace(/^\s*更新至\s*\d+\s*集\s*/g, '')
      .trim();
  }
  function findMediaLinks(doc, maxItems, selector) {
    const out = [], seen = Object.create(null);
    const candidates = doc.select(selector || 'a[href*="/video/"]');
    for (const a of candidates) {
      const href = a.attr('href') || '';
      const id = mediaIdFromUrl(href);
      if (!id || seen[id]) continue;
      const title = titleFromAnchor(a);
      if (!title || title.length > 180 || /^\d{1,3}$/.test(title)) continue;
      const item = { id, title, type: 'short' };
      const cover = firstImage(a);
      if (cover && /^https:\/\//.test(cover)) item.cover = cover;
      out.push(item);
      seen[id] = true;
      if (out.length >= maxItems) break;
    }
    return out;
  }
  function hasNextPage(doc, currentPage) {
    const links = doc.select('a[href]');
    for (const a of links) {
      if (!/下一页/.test(a.text())) continue;
      const href = a.attr('href') || '';
      const n = href.match(/\/(\d+)\/?(?:[?#]|$)/);
      if (n && Number(n[1]) === currentPage + 1) return true;
    }
    return false;
  }
  function rootUrl(cat, page) {
    const base = ROOTS[cat];
    if (!base) throw new hg.PluginError('INVALID_ARGUMENT', '未知的分类');
    return BASE + base + (page > 1 ? page + '/' : '');
  }
  async function listCategory(cat, cursor, ctx) {
    const p = Number(cursor || '1');
    if (!Number.isSafeInteger(p) || p < 1 || p > 10000) {
      throw new hg.PluginError('INVALID_ARGUMENT', '分页参数无效');
    }
    const { doc } = await requestHtml(rootUrl(cat, p), ctx);
    const items = findMediaLinks(doc, 100);
    return { items, next: hasNextPage(doc, p) ? String(p + 1) : null };
  }
  function getDescription(doc) {
    const og = doc.first('meta[property="og:description"]') || doc.first('meta[name="description"]');
    const val = og ? (og.attr('content') || '') : '';
    return val.slice(0, 2500);
  }
  function episodeAnchors(doc, id) {
    const byNumber = Object.create(null);
    // Actual site routes: /video/<id>/ for episode 1, /video/<id>/ep-2/ etc.
    for (const a of doc.select('a[href*="/video/"]')) {
      const n = episodeFromUrl(a.attr('href'), id);
      if (!n || Number(n) > 5000) continue;
      byNumber[n] = true;
    }
    byNumber['1'] = true;
    return Object.keys(byNumber)
      .map(n => ({ id: n, index: Number(n), episodeNumber: Number(n), label: '第 ' + n + ' 集' }))
      .sort((a, b) => a.index - b.index);
  }
  function extractNativeMedia(html, doc) {
    const vid = doc.first('video[src]') || doc.first('video source[src]');
    if (vid) {
      const src = absolute(vid.attr('src'));
      if (/^https:\/\//.test(src) && /\.(?:m3u8|mp4)(?:[?#]|$)/i.test(src)) return src;
    }
    // Only scan text actually present in the fetched watch-page HTML.
    // Does not execute JS, defeat DRM, or invent a stream endpoint.
    const normalized = html
      .replace(/\\\//g, '/')
      .replace(/\\u002[fF]/g, '/')
      .replace(/\\u0026/g, '&')
      .replace(/&amp;/g, '&');
    const match = normalized.match(/https:\/\/[^\s"'<>\\]{6,2048}?\.(?:m3u8|mp4)(?:\?[^\s"'<>\\]*)?/i);
    return match ? match[0] : '';
  }
  return {
    media: {
      async getDetail({ id }, ctx) {
        if (!/^\d+$/.test(String(id))) throw new hg.PluginError('INVALID_ARGUMENT', '作品编号无效');
        const { doc } = await requestHtml(episodePage(id, '1'), ctx);
        const h1 = doc.first('h1');
        const ogTitle = doc.first('meta[property="og:title"]');
        const title = (h1 ? h1.text() : ogTitle ? ogTitle.attr('content') : '') || ('作品 ' + id);
        const coverNode = doc.first('meta[property="og:image"]');
        const cover = coverNode ? absolute(coverNode.attr('content')) : '';
        const detail = {
          id: String(id), title: title.trim(), type: 'short',
          playlists: [{ id: 'main', label: '正片', kind: 'main', episodes: episodeAnchors(doc, id) }]
        };
        const description = getDescription(doc);
        if (description) detail.description = description;
        if (cover && /^https:\/\//.test(cover)) detail.cover = cover;
        return detail;
      },
      async resolvePlayback({ mediaId, episodeId }, ctx) {
        const page = episodePage(mediaId, episodeId);
        if (hg.settings.get('externalOnly') === true) {
          return { streams: [{ url: page, kind: 'external', label: '原站网页观看', external: { app: '浏览器' } }] };
        }
        const { html, doc } = await requestHtml(page, ctx);
        const url = extractNativeMedia(html, doc);
        if (url) {
          return { streams: [{
            url, kind: 'media', format: /\.m3u8(?:[?#]|$)/i.test(url) ? 'hls' : 'progressive',
            label: '网页中公开的媒体地址', headers: { Referer: page }
          }] };
        }
        // Most sites fetch media dynamically. Opening the site in the browser
        // is deliberate and honest fallback, not a fake playable stream.
        return { streams: [{ url: page, kind: 'external', label: '原站网页观看', external: { app: '浏览器' } }] };
      },
      matchUrl({ url }) {
        if (!/^https:\/\/(?:www\.)?languo\.ai\/video\//i.test(String(url || ''))) return null;
        const id = mediaIdFromUrl(url);
        return id ? { mediaId: id, episodeId: episodeFromUrl(url, id) || '1' } : null;
      }
    },
    home: {
      async getSections(_params, ctx) {
        const results = await Promise.all([
          listCategory('original', null, ctx),
          listCategory('duanju', null, ctx)
        ]);
        return {
          items: [
            { id: 'original', title: '蓝果原创', layout: 'grid', items: results[0].items.slice(0, 24), more: true },
            { id: 'duanju', title: '短剧', layout: 'grid', items: results[1].items.slice(0, 24), more: true }
          ], next: null
        };
      },
      async listSection({ sectionId, cursor }, ctx) {
        return listCategory(sectionId, cursor, ctx);
      }
    },
    catalog: {
      getCategories() {
        return [
          { id: 'original', label: '蓝果原创' },
          { id: 'duanju', label: '短剧' },
          { id: 'gv', label: '其他成人影片' }
        ];
      },
      async list({ categoryId, cursor }, ctx) {
        return listCategory(categoryId, cursor, ctx);
      }
    },
    search: {
      async search({ query, cursor }, ctx) {
        const q = String(query || '').trim();
        if (!q) return { items: [], next: null };
        if (q.length > 100) throw new hg.PluginError('INVALID_ARGUMENT', '搜索关键词过长');

        const p = Number(cursor || '1');
        if (!Number.isSafeInteger(p) || p < 1 || p > 1000) {
          throw new hg.PluginError('INVALID_ARGUMENT', '搜索分页参数无效');
        }

        // The official website uses navigable HTML search result pages:
        //   /search/video/<encoded query>/
        //   /search/gv/<encoded query>/
        // Unlike the old v0.1.0 behavior, we DO NOT scan just the first
        // two pages of the generic catalog to approximate search.
        const keyword = encodeURIComponent(q);
        async function getResults(type) {
          const base = BASE + '/search/' + type + '/' + keyword + '/';
          const url = p === 1 ? base : base + p + '/';
          const { doc } = await requestHtml(url, ctx);
          // Limit to the actual main search results; global search overlay,
          // hot-ranking links, and recommended cards must not contaminate it.
          const items = findMediaLinks(doc, 120, 'main a[href*="/video/"]');
          let hasNext = false;
          const nextSuffix = '/search/' + type + '/' + keyword.toLowerCase() + '/' + (p + 1) + '/';
          for (const a of doc.select('main a[href]')) {
            const href = String(a.attr('href') || '').toLowerCase().split('?')[0].split('#')[0];
            if (href.endsWith(nextSuffix)) {
              hasNext = true;
              break;
            }
          }
          return { items, hasNext };
        }

        const results = await Promise.allSettled([getResults('video'), getResults('gv')]);
        const good = results.filter(r => r.status === 'fulfilled');
        if (good.length === 0) {
          throw new hg.PluginError('UPSTREAM_ERROR', '蓝果搜索结果页暂时不可访问');
        }
        const seen = Object.create(null), items = [];
        let hasNext = false;
        for (const result of good) {
          const { items: current, hasNext: more } = result.value;
          if (more) hasNext = true;
          for (const item of current) {
            if (!seen[item.id]) {
              seen[item.id] = true;
              items.push(item);
            }
          }
        }
        if (good.length !== results.length) {
          hg.log.warn('蓝果部分搜索频道未能加载，请重试');
        }
        return { items, next: hasNext ? String(p + 1) : null };
      }
    }
  };
}

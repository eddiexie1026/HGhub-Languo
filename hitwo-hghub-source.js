/**
 * HiTwo 嗨兔 HPP 1.0 — official website catalog prototype
 * Public website: https://xkhuyu.top/
 * Sources verified: /dramas/, /dramas/page/2/, /rank/, /dramas/<id>/
 *
 * IMPORTANT: The website says episodes are watched in the official mobile app.
 * This plugin is a CATALOG integration, NOT a native HGhub video source.
 * Playback opens the real public detail page; there is no fabricated stream URL.
 * No paid unlocking, authentication bypass, or DRM circumvention.
 */
export const meta = {
  id: 'community.hitwo.web.catalog',
  name: 'HiTwo 嗨兔（官网目录版）',
  version: '0.1.1',
  protocol: 1,
  kind: 'source',
  mature: true,
  author: 'Community prototype',
  description: '基于 xkhuyu.top 官方公开网页：短剧列表、排行榜、作品详情与分集目录。网页不提供已验证的播放流，观看需官方 App。本插件不支持直接在 HGhub 播放，点击分集会明确提示。搜索仅扫描少量目录页。',
  homepage: 'https://xkhuyu.top/',
  updateUrl: 'https://raw.githubusercontent.com/eddiexie1026/HGhub-Languo/main/hitwo-hghub-source.js',
  linkDomains: ['xkhuyu.top', 'www.xkhuyu.top'],
  requires: [{ type: 'api', name: 'html.parse' }],
  defaultHeaders: { Referer: 'https://xkhuyu.top/' },
  timeouts: { read: 25, playback: 15 },
  settings: [
    {
      key: 'searchDepth',
      type: 'select',
      label: '标题检索：扫描目录页数（不是 App 全库搜索）',
      default: '3',
      options: [
        { value: '1', label: '1 页（快速）' },
        { value: '3', label: '3 页（默认）' },
        { value: '5', label: '5 页（较慢）' }
      ]
    }
  ]
};

export default function(hg) {
  const BASE = 'https://xkhuyu.top';
  const HTTP_HEADERS = { Accept: 'text/html,application/xhtml+xml', Referer: BASE + '/' };

  function asId(raw) {
    const s = String(raw || '').trim();
    if (!/^\d{1,12}$/.test(s)) {
      throw new hg.PluginError('INVALID_ARGUMENT', '无效的嗨兔作品编号');
    }
    return s;
  }

  function dramaUrl(id) {
    return BASE + '/dramas/' + asId(id) + '/';
  }

  function pageUrl(page) {
    if (!Number.isSafeInteger(page) || page < 1 || page > 1000) {
      throw new hg.PluginError('INVALID_ARGUMENT', '无效的分页编号');
    }
    return BASE + (page === 1 ? '/dramas/' : '/dramas/page/' + page + '/');
  }

  function toHttps(raw) {
    const s = String(raw || '').trim();
    if (!s || /^(?:data|javascript):/i.test(s)) return '';
    if (/^https:\/\//i.test(s)) return s;
    if (/^\/\//.test(s)) return 'https:' + s;
    if (s.startsWith('/')) return BASE + s;
    return BASE + '/' + s.replace(/^\.\//, '');
  }

  function idFromLink(url) {
    const match = String(url || '').match(/\/dramas\/(\d+)\/?(?:[?#].*)?$/);
    return match ? match[1] : '';
  }

  async function getDocument(path, ctx) {
    const url = path.startsWith('https://') ? path : BASE + path;
    const response = await hg.http.fetch({
      url: url,
      responseType: 'text',
      headers: HTTP_HEADERS,
      timeoutMs: 15000,
      maxBytes: 3 * 1024 * 1024,
      cache: { ttlSec: 120 },
      signal: ctx && ctx.signal
    });
    if (!response.ok || typeof response.data !== 'string') {
      throw new hg.PluginError('UPSTREAM_ERROR', '嗨兔官网请求失败（HTTP ' + response.status + '）');
    }
    if (!/<html|<body|<main/i.test(response.data)) {
      throw new hg.PluginError('UPSTREAM_CHANGED', '官网返回内容不是可解析的网页');
    }
    return hg.html.parse(response.data);
  }

  function posterFrom(anchorOrDoc) {
    const og = anchorOrDoc.first('meta[property="og:image"]');
    if (og) {
      const url = toHttps(og.attr('content'));
      if (url.startsWith('https://')) return url;
    }
    const images = anchorOrDoc.select('img');
    for (const img of images) {
      const alt = img.attr('alt') || '';
      if (/海报|封面|短剧|剧照/.test(alt) || images.length === 1) {
        const url = toHttps(img.attr('data-src') || img.attr('data-original') || img.attr('src'));
        if (url.startsWith('https://')) return url;
      }
    }
    return '';
  }

  function titleFrom(anchor) {
    const heading = anchor.first('h2,h3,h4');
    if (heading && heading.text().trim()) return heading.text().trim().slice(0, 190);
    const img = anchor.first('img[alt]');
    if (img) {
      const alt = String(img.attr('alt') || '').replace(/(?:短剧)?(?:海报|封面|剧照)$/, '').trim();
      if (alt && !/^(?:HiTwo|嗨兔短剧|图片)$/.test(alt)) return alt.slice(0, 190);
    }
    let title = String(anchor.text() || '').trim()
      .replace(/^\s*(?:(?:独家|首发|热门|推荐)\s*)+/, '')
      .replace(/\s*·\s*\d+(?:\.\d+)?(?:万|亿)?热度.*$/, '')
      .replace(/\s*(?:国内|现代|古代|架空|民国|甜宠|双洁|年上|年下|青春校园|追妻火葬场|仙侠)[,，、].*$/, '')
      .trim();
    return title.slice(0, 190);
  }

  function extractCatalog(doc, limit) {
    const seen = Object.create(null), items = [];
    const anchors = doc.select('a[href*="/dramas/"]');
    for (const a of anchors) {
      const id = idFromLink(a.attr('href') || '');
      if (!id || seen[id]) continue;
      const title = titleFrom(a);
      if (!title || title.length < 2 || /^\d+$/.test(title)) continue;
      const item = { id: id, title: title, type: 'short' };
      const cover = posterFrom(a);
      if (cover) item.cover = cover;
      seen[id] = true;
      items.push(item);
      if (items.length >= limit) break;
    }
    return items;
  }

  function hasNext(doc, nextPage) {
    const tail = '/dramas/page/' + nextPage + '/';
    for (const a of doc.select('a[href*="/dramas/page/"]')) {
      const h = String(a.attr('href') || '').split('?')[0].split('#')[0];
      if (h.endsWith(tail)) return true;
    }
    return false;
  }

  async function listDramas(cursor, ctx) {
    const page = Number(cursor || '1');
    const doc = await getDocument(pageUrl(page), ctx);
    return {
      items: extractCatalog(doc, 100),
      next: hasNext(doc, page + 1) ? String(page + 1) : null
    };
  }

  async function listRanking(ctx) {
    const doc = await getDocument('/rank/', ctx);
    // The official ranking includes novels as well; use only hrefs for drama IDs.
    return { items: extractCatalog(doc, 50), next: null };
  }

  function episodeIdsFrom(doc) {
    // Use the real numbered entries, NOT the claimed total count:
    // some detail pages show null labels or have holes in numbering.
    const body = String(doc.text() || '');
    const start = body.indexOf('分集目录');
    if (start < 0) return [];
    const tail = body.indexOf('相关推荐', start);
    const section = body.slice(start, tail > start ? tail : Math.min(body.length, start + 30000));
    const unique = Object.create(null), ids = [];
    const matcher = /第\s*0*(\d{1,4})\s*集/g;
    let match;
    while ((match = matcher.exec(section)) !== null) {
      const n = Number(match[1]);
      if (!Number.isSafeInteger(n) || n < 1 || n > 2000 || unique[n]) continue;
      unique[n] = true;
      ids.push(n);
    }
    return ids.sort((a, b) => a - b);
  }

  function descriptionFrom(doc) {
    const m = doc.first('meta[property="og:description"],meta[name="description"]');
    if (m && m.attr('content')) return String(m.attr('content')).slice(0, 1500);
    const paragraphs = doc.select('p');
    for (const p of paragraphs) {
      const text = p.text().trim();
      if (text.length > 30 && !/下载.*App/.test(text)) return text.slice(0, 1500);
    }
    return '';
  }

  return {
    media: {
      async getDetail({ id }, ctx) {
        const mediaId = asId(id);
        const doc = await getDocument('/dramas/' + mediaId + '/', ctx);
        const heading = doc.first('h1');
        const title = (heading ? heading.text() : '')
          .replace(/\[(?:独家|首发)\]/g, '').trim();
        if (!title) {
          throw new hg.PluginError('UPSTREAM_CHANGED', '官网作品详情缺少标题');
        }
        const ids = episodeIdsFrom(doc);
        if (ids.length === 0) {
          throw new hg.PluginError('UPSTREAM_CHANGED', '官网分集目录未识别到有效集数');
        }
        const episodes = ids.map((n, i) => ({
          id: String(n),
          index: i + 1,
          label: '第 ' + n + ' 集（官方 App 观看）',
          episodeNumber: n
        }));
        const result = {
          id: mediaId,
          title: title,
          type: 'short',
          description: '当前官网分集点击后引导下载 App，没有已验证的网页播放流。本 HGhub 插件仅提供目录，点击分集无法在 HGhub 播放，需使用官方 Hitwo App 观看。',
          episodeCount: ids.length,
          playlists: [{
            id: 'main',
            kind: 'main',
            label: '官方分集目录（App 观看）',
            episodes: episodes
          }]
        };
        const cover = posterFrom(doc);
        if (cover) result.cover = cover;
        const more = descriptionFrom(doc);
        if (more) result.description = more + '\n\n' + result.description;
        return result;
      },

      resolvePlayback({ mediaId, episodeId }) {
        asId(mediaId);
        if (!/^\d+$/.test(String(episodeId || ''))) {
          throw new hg.PluginError('INVALID_ARGUMENT', '分集编号无效');
        }
        // No real website media URL has been verified. Returning the detail
        // webpage as kind:external previously opened the HGhub player with
        // an unplayable address. Fail explicitly instead of faking a stream.
        throw new hg.PluginError(
          'UNSUPPORTED',
          'HiTwo 官网该分集仅引导在官方 App 观看，目前无已验证的 HGhub 播放地址。请使用官方 App。'
        );
      },

      matchUrl({ url }) {
        if (!/^https:\/\/(?:www\.)?xkhuyu\.top\/dramas\//i.test(String(url || ''))) return null;
        const id = idFromLink(url);
        return id ? { mediaId: id, episodeId: '1' } : null;
      }
    },

    home: {
      async getSections(_params, ctx) {
        const results = await Promise.all([listRanking(ctx), listDramas(null, ctx)]);
        return {
          items: [
            { id: 'rank', title: '嗨兔短剧热榜（官网）', layout: 'grid', items: results[0].items.slice(0, 24), more: true },
            { id: 'dramas', title: '最新短剧（官网）', layout: 'grid', items: results[1].items.slice(0, 24), more: true }
          ],
          next: null
        };
      },
      async listSection({ sectionId, cursor }, ctx) {
        return sectionId === 'rank' ? listRanking(ctx) : listDramas(cursor, ctx);
      }
    },

    catalog: {
      getCategories() {
        return [
          { id: 'dramas', label: '官网短剧库' },
          { id: 'rank', label: '官网热度榜' }
        ];
      },
      async list({ categoryId, cursor }, ctx) {
        if (categoryId === 'rank') return listRanking(ctx);
        if (categoryId === 'dramas') return listDramas(cursor, ctx);
        throw new hg.PluginError('INVALID_ARGUMENT', '未知的目录分类');
      }
    },

    search: {
      async search({ query }, ctx) {
        const q = String(query || '').trim().toLocaleLowerCase();
        if (!q) return { items: [], next: null };
        const requested = Number(hg.settings.get('searchDepth') || '3');
        const maxPages = Math.max(1, Math.min(5, Number.isFinite(requested) ? requested : 3));
        const tasks = [listRanking(ctx)];
        for (let p = 1; p <= maxPages; p++) {
          tasks.push(listDramas(String(p), ctx));
        }
        // No validated official full-library search API on the public website.
        // This bounded search will omit some works found by the mobile app.
        const results = await Promise.allSettled(tasks);
        if (!results.some(r => r.status === 'fulfilled')) {
          throw new hg.PluginError('UPSTREAM_ERROR', '嗨兔官网目录暂时无法检索');
        }
        const seen = Object.create(null), items = [];
        for (const result of results) {
          if (result.status !== 'fulfilled') continue;
          for (const item of result.value.items) {
            if (seen[item.id] || !item.title.toLocaleLowerCase().includes(q)) continue;
            seen[item.id] = true;
            items.push(item);
          }
        }
        return { items, next: null };
      }
    }
  };
}

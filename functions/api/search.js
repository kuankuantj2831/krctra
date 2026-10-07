/**
 * Cloudflare Pages Function: /api/search
 * 运行在 Cloudflare 全球边缘节点上，直接代表用户抓取各大真实搜索引擎网页，彻底破除浏览器 CORS 限制！
 */
export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const query = url.searchParams.get('q') || '';
  const engine = url.searchParams.get('engine') || 'all';

  if (!query.trim()) {
    return new Response(JSON.stringify({ results: [] }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  try {
    let tasks = [];

    if (engine === 'all' || engine === 'bing') {
      tasks.push(fetchBing(query));
    }
    if (engine === 'all' || engine === 'ddg') {
      tasks.push(fetchDuckDuckGoHtml(query));
    }

    const settled = await Promise.allSettled(tasks);
    let combined = [];

    for (const res of settled) {
      if (res.status === 'fulfilled' && Array.isArray(res.value)) {
        combined = combined.concat(res.value);
      }
    }

    return new Response(JSON.stringify({ results: combined }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message, results: [] }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

/**
 * 抓取真实 Bing 搜索结果
 */
async function fetchBing(query) {
  try {
    const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=zh-Hans`;
    const resp = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      }
    });

    if (!resp.ok) return [];

    const html = await resp.text();
    const results = [];

    // 正则提取 Bing 条目: <li class="b_algo">...<h2><a href="...">标题</a></h2>...<p>摘要</p>...
    const algoRegex = /<li class="b_algo"[\s\S]*?<\/li>/gi;
    let match;

    while ((match = algoRegex.exec(html)) !== null && results.length < 10) {
      const block = match[0];

      // 提取链接和标题
      const linkMatch = /<h2>\s*<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/i.exec(block);
      if (!linkMatch) continue;

      const rawHref = linkMatch[1];
      const rawTitle = cleanHtml(linkMatch[2]);

      // 提取摘要: class="b_caption" 或 <p>
      let rawSnippet = '';
      const snippetMatch = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(block);
      if (snippetMatch) {
        rawSnippet = cleanHtml(snippetMatch[1]);
      }

      if (rawHref && rawTitle) {
        results.push({
          id: `bing-${Math.random()}`,
          title: rawTitle,
          snippet: rawSnippet || '无详细摘要',
          url: rawHref,
          source: 'Bing 网页搜索'
        });
      }
    }

    return results;
  } catch (e) {
    return [];
  }
}

/**
 * 抓取 DuckDuckGo 真实 HTML 搜索结果
 */
async function fetchDuckDuckGoHtml(query) {
  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const resp = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    if (!resp.ok) return [];

    const html = await resp.text();
    const results = [];

    // 匹配 DDG 条目: class="result results_links results_links_deep web-result"
    const blockRegex = /<div class="result\s+results_links[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/gi;
    let match;

    while ((match = blockRegex.exec(html)) !== null && results.length < 8) {
      const block = match[0];

      // 标题与链接: class="result__a"
      const aMatch = /<a class="result__a"\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
      if (!aMatch) continue;

      let href = aMatch[1];
      // DDG 有时会包装跳转: //duckduckgo.com/l/?uddg=真实网址
      if (href.includes('uddg=')) {
        const decoded = decodeURIComponent(href.split('uddg=')[1].split('&')[0]);
        if (decoded) href = decoded;
      }

      const title = cleanHtml(aMatch[2]);

      // 摘要: class="result__snippet"
      let snippet = '';
      const snipMatch = /<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
      if (snipMatch) {
        snippet = cleanHtml(snipMatch[1]);
      }

      if (href && title) {
        results.push({
          id: `ddg-${Math.random()}`,
          title: title,
          snippet: snippet || '无详细摘要',
          url: href,
          source: 'DuckDuckGo 网页'
        });
      }
    }

    return results;
  } catch (e) {
    return [];
  }
}

/**
 * 辅助函数：清洗 HTML 标签与实体字符
 */
function cleanHtml(str) {
  if (!str) return '';
  return str
    .replace(/<[^>]+>/g, '') // 移除 HTML 标签
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

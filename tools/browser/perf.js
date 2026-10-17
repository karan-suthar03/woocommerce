(() => {
  const nav = performance.getEntriesByType('navigation')[0];
  const res = performance.getEntriesByType('resource');
  const kb = n => Math.round(n / 1024);
  const byType = {};
  for (const r of res) {
    const t = r.initiatorType;
    byType[t] ??= { count: 0, kb: 0 };
    byType[t].count++;
    byType[t].kb += kb(r.transferSize || r.encodedBodySize || 0);
  }
  const heaviest = [...res]
    .sort((a, b) => (b.transferSize || b.encodedBodySize) - (a.transferSize || a.encodedBodySize))
    .slice(0, 8)
    .map(r => `${kb(r.transferSize || r.encodedBodySize)}KB ${Math.round(r.duration)}ms ${r.name.replace(location.origin, '').slice(0, 90)}`);
  const slowest = [...res].sort((a, b) => b.duration - a.duration).slice(0, 6)
    .map(r => `${Math.round(r.duration)}ms ${r.name.replace(location.origin, '').slice(0, 90)}`);
  const imgs = [...document.images].map(i => ({ src: i.currentSrc, w: i.naturalWidth, shown: i.clientWidth }))
    .filter(i => i.w > 2 * (i.shown || 1) && i.shown > 0).slice(0, 5)
    .map(i => `${i.w}px shown at ${i.shown}px: ${i.src.slice(0, 80)}`);
  const lcp = performance.getEntriesByType('largest-contentful-paint').at(-1);
  return {
    url: location.href,
    ttfb_ms: Math.round(nav.responseStart),
    domContentLoaded_ms: Math.round(nav.domContentLoadedEventEnd),
    load_ms: Math.round(nav.loadEventEnd),
    lcp_ms: lcp ? Math.round(lcp.startTime) : null,
    requests: res.length,
    total_kb: Object.values(byType).reduce((s, x) => s + x.kb, 0),
    byType, heaviest, slowest, oversizedImages: imgs,
    failed404Images: [...document.images].filter(i => i.complete && i.naturalWidth === 0).length,
  };
})()

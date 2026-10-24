// Shared link-cleaning logic. Loaded by the service worker (importScripts),
// the content script, and the settings page, so every feature strips the
// same parameters. Exposes a single global: TrackerStripper.
(function (root) {
  'use strict';

  // Google Analytics campaign tags. The cleaner also strips any other
  // parameter starting with "utm_"; this explicit list is what the
  // navigation feature uses, because Chrome's redirect rules need exact names.
  const UTM_PARAMS = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'utm_id', 'utm_name', 'utm_cid', 'utm_reader', 'utm_referrer',
    'utm_social', 'utm_social-type', 'utm_brand', 'utm_place',
    'utm_pubreferrer', 'utm_swu', 'utm_viz_id', 'utm_source_platform',
    'utm_creative_format', 'utm_marketing_tactic', 'utm_campaign_id',
    'utm_keyword', 'utm_adgroup', 'utm_device', 'utm_network', 'utm_placement'
  ];

  // Click IDs and tracking tags that are safe to strip on every site.
  const GLOBAL_PARAMS = UTM_PARAMS.concat([
    // Ad click identifiers
    'fbclid', 'gclid', 'gclsrc', 'dclid', 'gbraid', 'wbraid', 'gad_source',
    'gad_campaignid', 'msclkid', 'yclid', 'ysclid', 'twclid', 'ttclid',
    'li_fat_id', 'epik', 'rdt_cid', 'irclickid', 'srsltid', 'scid',
    // Email / marketing automation
    'mc_cid', 'mc_eid', 'mkt_tok', '_hsenc', '_hsmi', '__hsfp', '__hssc',
    '__hstc', 'hsctatracking', 'vero_id', 'vero_conv', 'oly_anon_id',
    'oly_enc_id', 'rb_clickid', 'wickedid', 'ml_subscriber',
    'ml_subscriber_hash', 'sc_cid', 's_cid', 'ss_campaign_id',
    // Analytics cross-domain linkers
    '_ga', '_gl', '_openstat', '_kx',
    // Matomo / Piwik campaign tags
    'pk_campaign', 'pk_kwd', 'pk_keyword', 'pk_source', 'pk_medium',
    'pk_content', 'pk_cid', 'mtm_campaign', 'mtm_kwd', 'mtm_source',
    'mtm_medium', 'mtm_content', 'mtm_cid', 'mtm_group', 'mtm_placement',
    // Instagram share IDs show up on links to many sites
    'igshid', 'igsh'
  ]);

  const PREFIXES = ['utm_'];

  const AMAZON_DOMAINS = [
    'amazon.com', 'amazon.ca', 'amazon.com.mx', 'amazon.com.br',
    'amazon.co.uk', 'amazon.de', 'amazon.fr', 'amazon.it', 'amazon.es',
    'amazon.nl', 'amazon.se', 'amazon.pl', 'amazon.com.be', 'amazon.com.tr',
    'amazon.ae', 'amazon.sa', 'amazon.eg', 'amazon.in', 'amazon.co.jp',
    'amazon.sg', 'amazon.com.au'
  ];

  const GOOGLE_DOMAINS = [
    'google.com', 'google.ca', 'google.co.uk', 'google.de', 'google.fr',
    'google.it', 'google.es', 'google.nl', 'google.com.au', 'google.co.in',
    'google.co.jp', 'google.com.br', 'google.com.mx'
  ];

  // Parameters that only count as tracking on specific sites. Some of these
  // names (like "si", "s", "t", "ref_") mean something else elsewhere.
  const SITE_RULES = [
    { name: 'YouTube', domains: ['youtube.com', 'youtu.be', 'youtube-nocookie.com'],
      params: ['si', 'feature', 'pp', 'embeds_referring_euri', 'source_ve_path'] },
    { name: 'Spotify', domains: ['spotify.com', 'spotify.link'],
      params: ['si', 'nd', 'dlsi', 'context', 'sp_cid'] },
    { name: 'Instagram', domains: ['instagram.com'],
      params: ['igsh', 'igshid', 'img_index', 'ig_rid', 'ig_mid'] },
    { name: 'Facebook', domains: ['facebook.com', 'fb.watch', 'messenger.com'],
      params: ['mibextid', 'rdid', 'sfnsn', 'ref', 'refsrc', 'hc_ref', '__tn__', 'fref', 'hrc'] },
    { name: 'X / Twitter', domains: ['twitter.com', 'x.com'],
      params: ['s', 't', 'ref_src', 'ref_url'] },
    { name: 'TikTok', domains: ['tiktok.com'],
      params: ['_t', '_r', 'is_from_webapp', 'sender_device', 'is_copy_url',
        'share_app_id', 'share_link_id', 'share_item_id', 'social_sharing',
        'tt_from', 'u_code', 'preview_pb', 'timestamp', 'user_id',
        'sec_user_id', 'utm_campaign', 'web_id'] },
    { name: 'Reddit', domains: ['reddit.com', 'redd.it'],
      params: ['share_id', 'rdt', 'ref_source', 'ref_campaign', '%24deep_link',
        '$deep_link', 'correlation_id', 'post_fullname', 'post_index'] },
    { name: 'LinkedIn', domains: ['linkedin.com'],
      params: ['trackingid', 'refid', 'lipi', 'trk', 'trkinfo', 'midtoken',
        'midsig', 'eid', 'otptoken', 'origin', 'rcm'] },
    { name: 'Amazon', domains: AMAZON_DOMAINS,
      params: ['ref', 'ref_', 'pd_rd_w', 'pd_rd_wg', 'pd_rd_r', 'pd_rd_i',
        'pd_rd_p', 'pf_rd_p', 'pf_rd_r', 'pf_rd_s', 'pf_rd_t', 'pf_rd_i',
        'pf_rd_m', 'content-id', 'qid', 'sr', 'sprefix', 'crid', 'dib',
        'dib_tag', '_encoding', 'psc_ref', 'linkcode', 'linkid',
        'ascsubtag', 'creativeasin', 'creative', 'camp', 'smid_ref', 'spla',
        'social_share', 'starsleft', 'skiptwisterog'],
      // Amazon also hides tracking in the path: /dp/B000/ref=sr_1_1
      pathPatterns: [/\/ref=[^/?#]*/i] },
    { name: 'Google', domains: GOOGLE_DOMAINS,
      params: ['ved', 'ei', 'sa', 'uact', 'gs_lcrp', 'gs_lp', 'oq', 'sclient',
        'sxsrf', 'aqs', 'sourceid', 'ie', 'bih', 'biw', 'dpr', 'gs_ssp',
        'rlz', 'iflsig', 'source', 'sca_esv', 'sca_upv', 'stick'] },
    { name: 'eBay', domains: ['ebay.com', 'ebay.co.uk', 'ebay.de', 'ebay.ca', 'ebay.com.au'],
      params: ['_trkparms', '_trksid', 'hash', 'amdata', 'mkcid', 'mkrid',
        'campid', 'toolid', 'customid', 'mkevt', '_from', 'itmmeta'] },
    { name: 'AliExpress', domains: ['aliexpress.com', 'aliexpress.us'],
      params: ['spm', 'scm', 'algo_pvid', 'algo_exp_id', 'pdp_npi',
        'pdp_ext_f', 'aff_platform', 'aff_trace_key', 'sk', 'gatewayadapt',
        'btsid', 'ws_ab_test', 'terminal_id'] },
    { name: 'Medium', domains: ['medium.com'], params: ['source', 'sk'] },
    { name: 'Bing', domains: ['bing.com'], params: ['form', 'sp', 'qs', 'sk', 'cvid', 'ghc', 'lq', 'pq', 'sc'] },
    { name: 'Twitch', domains: ['twitch.tv'], params: ['tt_medium', 'tt_content'] }
  ];

  // Links that just bounce you to another URL. When cleaning, we unwrap them
  // to the real destination.
  const REDIRECT_WRAPPERS = [
    { domains: GOOGLE_DOMAINS, path: /^\/url$/, params: ['q', 'url'] },
    { domains: ['youtube.com'], path: /^\/redirect$/, params: ['q'] },
    { domains: ['l.facebook.com', 'lm.facebook.com', 'l.messenger.com'], path: /^\/l\.php$/, params: ['u'] },
    { domains: ['l.instagram.com'], path: /^\/$/, params: ['u'] },
    { domains: ['out.reddit.com'], path: /.*/, params: ['url'] },
    { domains: ['steamcommunity.com'], path: /^\/linkfilter\/?$/, params: ['url', 'u'] },
    { domains: ['slack-redir.net'], path: /^\/link$/, params: ['url'] },
    { domains: ['disq.us'], path: /^\/url$/, params: ['url'] }
  ];

  const DEFAULT_SETTINGS = {
    copyIntercept: true,
    contextMenu: true,
    toolbarButton: true,
    navigation: true,
    extraParams: ''
  };

  function hostMatches(host, domains) {
    host = host.toLowerCase();
    return domains.some((d) => host === d || host.endsWith('.' + d));
  }

  function parseExtraParams(text) {
    return String(text || '')
      .split(/[\s,]+/)
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean);
  }

  function safeDecode(s) {
    try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch (e) { return s; }
  }

  // Returns the destination URL if `url` is a known redirect wrapper.
  function unwrap(url) {
    for (const w of REDIRECT_WRAPPERS) {
      if (!hostMatches(url.hostname, w.domains) || !w.path.test(url.pathname)) continue;
      for (const p of w.params) {
        const target = url.searchParams.get(p);
        if (target && /^https?:\/\//i.test(target)) return target;
      }
    }
    return null;
  }

  // Removes tracking parameters from a query string while leaving every
  // other parameter byte-for-byte untouched (URLSearchParams would re-encode).
  function filterQuery(query, shouldDrop) {
    if (!query) return query;
    const kept = query.split('&').filter((part) => {
      if (!part) return false;
      const key = safeDecode(part.split('=')[0]).toLowerCase();
      return !shouldDrop(key);
    });
    return kept.join('&');
  }

  /**
   * Strips tracking from a URL string. Returns the original string unchanged
   * if it is not an http(s) URL or contains nothing to remove.
   */
  function cleanUrl(input, extraParams) {
    if (typeof input !== 'string') return input;
    const original = input.trim();
    let current = original;
    const extras = new Set((extraParams || []).map((p) => p.toLowerCase()));

    for (let depth = 0; depth < 4; depth++) {
      let url;
      try { url = new URL(current); } catch (e) { return input; }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return input;

      const target = unwrap(url);
      if (target) { current = target; continue; }

      const siteParams = new Set();
      let pathPatterns = [];
      for (const rule of SITE_RULES) {
        if (hostMatches(url.hostname, rule.domains)) {
          rule.params.forEach((p) => siteParams.add(p.toLowerCase()));
          if (rule.pathPatterns) pathPatterns = pathPatterns.concat(rule.pathPatterns);
        }
      }
      const shouldDrop = (key) =>
        GLOBAL_SET.has(key) || siteParams.has(key) || extras.has(key) ||
        PREFIXES.some((pre) => key.startsWith(pre));

      // Work on the raw string so we never change encoding of what we keep.
      const m = current.match(/^([^?#]*)(\?[^#]*)?(#.*)?$/);
      let base = m[1];
      const query = m[2] ? m[2].slice(1) : '';
      let hash = m[3] || '';

      for (const re of pathPatterns) base = base.replace(re, '');

      const newQuery = filterQuery(query, shouldDrop);
      // Some sites (and newsletters) put tracking tags in the fragment: #utm_source=x
      if (/^#[^=&/]+=/.test(hash)) {
        const newHash = filterQuery(hash.slice(1), shouldDrop);
        hash = newHash ? '#' + newHash : '';
      }
      current = base + (newQuery ? '?' + newQuery : '') + hash;
      break;
    }
    return current === original ? input : current;
  }

  // True if the text is exactly one http(s) URL (ignoring surrounding spaces).
  function isSingleUrl(text) {
    if (typeof text !== 'string') return false;
    const t = text.trim();
    if (!t || t.length > 8192 || /\s/.test(t)) return false;
    if (!/^https?:\/\//i.test(t)) return false;
    try { new URL(t); return true; } catch (e) { return false; }
  }

  const GLOBAL_SET = new Set(GLOBAL_PARAMS.map((p) => p.toLowerCase()));

  root.TrackerStripper = {
    UTM_PARAMS, GLOBAL_PARAMS, SITE_RULES, AMAZON_DOMAINS, DEFAULT_SETTINGS,
    cleanUrl, isSingleUrl, parseExtraParams, hostMatches
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);

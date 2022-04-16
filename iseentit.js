const $ = document.querySelector.bind(document);
const $$ = document.querySelectorAll.bind(document);

const CONTENT_TYPES = {
  FILM: 'FILM',
  SERIES: 'SERIES',
};

const PLATFORMS = {
  IMDB: 'IMDB',
  RT: 'RT',
};

// FORMATS[platform][format] --> CSS selector
// NOTE: that some of these formats actually correspond to other areas (not
// listed here) on these platforms. The format names just represent the first
// place on each platform I found them. E.g. none of these formats mention the
// RT homepage, but it "just works". yolo
const FORMATS = {
  IMDB: {
    DETAIL: '[data-testid="hero-media__poster"]', // detail page
    LISTER: '.lister-item', // "lister" UX, e.g. /search/title/?genres=sci-fi
    LISTER_MINI: '.lister-list > tr', // compact "lister" UX, e.g. Top 250
    SHOVELER: '[data-testid="shoveler"] .ipc-poster-card', // "shoveler" carousels
  },
  RT: {
    BROWSE: '.mb-movie, .media-list__item', // /browse/ pages
    DETAIL: '.thumbnail-scoreboard-wrap', // detail page
    SERIES_OVERVIEW: '.tv-series__image-container', // series overview page
    SERIES_SEASON: '.js-poster-link', // series season page
    YMAL: 'tiles-carousel-responsive-item', // "YOU MIGHT ALSO LIKE"
  },
};

const HOSTS_TO_PLATFORMS = {
  'www.imdb.com': PLATFORMS.IMDB,
  'www.rottentomatoes.com': PLATFORMS.RT,
};

const RATINGS_STRINGS = {
  rewatchability: [
    `No interest in watching this again`,
    `It's worth a second viewing`,
    `It's worth watching a few times`,
    `I've watched / will watch this many times`,
    `I will never get tired of rewatching this`,
  ],
  artisticMerit: [
    `Little to no redeeming artistic qualities`,
    `An average movie or show`,
    `A quality film or series`,
    `Oscar-worthy`,
    `A cinematic masterpiece`,
  ]
};

const AVATAR_URL = chrome.runtime.getURL('iseentit.png');

const AUDIO = new Audio(chrome.runtime.getURL('iseentit.mp3'));

const RATINGS = { rewatchability: 0, artisticMerit: 0 }; // yolo

// PARSED_DATA_BY_TITLE necessary because RT does not include the year in
// their poster lockups.
let SYNC_DATA, PARSED_DATA, PARSED_DATA_BY_TITLE;

function getSavedMetadata (title, year) {
  if (!title || !year) return undefined;
  return PARSED_DATA.find(m => m.title === title && m.year === year);
}

/**
 * Stored data format: [1999, "The Green Mile", 5, 5]
 * I.e. [year, title, rewatchability, artistic merit]
 *
 * This condensed data format is due to chrome.storage.sync's 100kb limit.
 * With this format ~2000 movies/shows can be stored. That sounds like a lot
 * but my very incomplete and manually curated list is already approaching
 * 1000 movies.
 *
 * TODO: This can be improved further by bucketing movies by year. E.g.:
 *
 * {
 *   FILM: {
 *     1999: [
 *       ["The Green Mile", 5, 5]
 *     ]
 *   },
 *   SERIES: { ... }
 * }
 *
 * For a small number of films this takes up more space, but for 1000 films this
 * takes up way less space. The byte savings asymptotically approaches 4 bytes
 * per movie as the number of movies increases. This would be a breaking change,
 * so would need to bump to v2 but could in theory detect the old data format
 * and translate to the new format automagically. I expect to exceed the current
 * ~2000 movie limit at some point so this is actually worth doing.
 */
function decodeSyncData (syncData) {
  const itemsToMetadata = (type, items=[]) => {
    return items.map((item) => {
      const [year, title, rewatchability, artisticMerit] = item;
      return { type, year, title, rewatchability, artisticMerit };
    });
  };

  return itemsToMetadata(CONTENT_TYPES.FILM, syncData.FILM)
    .concat(itemsToMetadata(CONTENT_TYPES.SERIES, syncData.SERIES));
}

function getJsonLd (doc) {
  const script = doc.querySelector('script[type="application/ld+json"]');
  return JSON.parse(script.innerHTML);
}

function releaseDateToYear (releaseDate) {
  return new Date(Date.parse(releaseDate)).getFullYear();
}

async function fetchMetadataFromDetailPage (platform, node) {
  // All lockups on IMDB and RT include exactly one link. Thanks bros. If we
  // don't find a link, we're on a detail page, so just use current URL. :P
  const link = node.querySelector('a');
  const url = link?.href || window.location.href;
  const detailPage = await fetch(url);
  const html = await detailPage.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const jsonLd = getJsonLd(doc);
  const type =
    jsonLd['@type'] === 'Movie' ? CONTENT_TYPES.FILM : CONTENT_TYPES.SERIES;
  const title = jsonLd.name;

  let releaseDate, image;
  switch (platform) {
    case PLATFORMS.IMDB:
      releaseDate = jsonLd.datePublished;
      image = jsonLd.image;
      break;
    case PLATFORMS.RT:
      releaseDate = doc.querySelector(`
        .meta-row time,
        [data-qa="series-details-premiere-date"],
        [data-qa="season-premiere-date"]
      `).textContent;
      image = doc.querySelector(`
        [data-qa="movie-poster-link"] img,
        [data-qa="poster"] img
      `).src;
      break;
  }
  const year = releaseDateToYear(releaseDate);

  return { node, platform, type, year, title, image };
}

async function upsertRecord (node, metadata) {
  const detailMetadata =
    await fetchMetadataFromDetailPage(metadata.platform, node);
  const existingMetadata =
    getSavedMetadata(detailMetadata.title, detailMetadata.year);
  const newMetadata = {
    ...detailMetadata,
    ...existingMetadata,
    ...metadata,
    // year will be missing for RT, and the spread operator will overwrite the
    // corret year from detailMetadata, so just re-stuff the year back in at
    // the end. yolo
    // NOTE: Important to cast as string.
    year: String(detailMetadata.year),
  };

  // first write case
  SYNC_DATA[newMetadata.type] = SYNC_DATA[newMetadata.type] || [];

  let recordToUpdate;
  const existingRecord = SYNC_DATA[newMetadata.type].find((record) => {
    return record[0] === newMetadata.year && record[1] === newMetadata.title;
  });
  if (existingRecord) {
    recordToUpdate = existingRecord;
  } else {
    recordToUpdate = [];
    SYNC_DATA[newMetadata.type].push(recordToUpdate);
  }

  // Abusing js references here to avoid having to take PARSED_DATA and encode
  // it into a SYNC_DATA object, or otherwise get cute with array splicing etc.
  // This way the SYNC_DATA record just gets updated in place and both the
  // insert/update cases get poked the same way.
  recordToUpdate.length = 0;
  recordToUpdate.push(
    newMetadata.year, newMetadata.title,
    newMetadata.rewatchability || 0, newMetadata.artisticMerit || 0
  );

  return await chrome.storage.sync.set({ 'iseentit': SYNC_DATA });
}

async function deleteRecord (node, metadata) {
  const detailMetadata =
    await fetchMetadataFromDetailPage(metadata.platform, node);
  const existingRecord = SYNC_DATA[metadata.type].find((record) => {
    return record[0] === detailMetadata.year && record[1] === metadata.title;
  });
  const index = SYNC_DATA[metadata.type].indexOf(existingRecord);
  SYNC_DATA[metadata.type].splice(index, 1);
  return await chrome.storage.sync.set({ 'iseentit': SYNC_DATA });
}

function createRatingLinks (ratings) {
  return ratings.map((rating, i) => {
    return `<iseentit class="iseentit-link" data-rating="${i + 1}">${rating}</iseentit>`;
  }).reverse().join('');
}

function createModal (node, metadata, isSeent) {
  AUDIO.play();

  const container = document.createElement('iseentit');
  container.className = 'iseentit-modal-container';
  container.dataset.selectedScreen = 1;

  const yearHtml = metadata.year
    ? `<iseentit class="iseentit-year">(${metadata.year})</iseentit>`
    : '';

  container.innerHTML = `
    <iseentit class="iseentit-modal">
      <iseentit
        class="iseentit-avatar"
        style="background-image: url('${AVATAR_URL}')"
      ></iseentit>
      <iseentit
        class="iseentit-poster"
        style="background-image: url('${metadata.image}')"
      ></iseentit>
      <iseentit class="iseentit-screens">
        <iseentit class="iseentit-screen" data-screen="1">
          <iseentit class="iseentit-title">
            ${metadata.title}
            ${yearHtml}
          </iseentit>
          <iseentit class="iseentit-btn iseentit-btn-${isSeent ? 'delete' : 'seent'}">
            ${isSeent ? 'Delete' : 'I seent it!'}
          </iseentit>
          <iseentit class="iseentit-btn iseentit-btn-rate">Rate</iseentit>
        </iseentit>
        <iseentit class="iseentit-screen" data-screen="2">
          <iseentit class="iseentit-title">Rewatchability</iseentit>
          ${createRatingLinks(RATINGS_STRINGS.rewatchability)}
        </iseentit>
        <iseentit class="iseentit-screen" data-screen="3">
          <iseentit class="iseentit-title">Artistic Merit</iseentit>
          ${createRatingLinks(RATINGS_STRINGS.artisticMerit)}
        </iseentit>
      </iseentit>
    </iseentit>
  `;

  container.addEventListener('click', async (e) => {
    if (e.target === container) {
      destroyModal();
      return;
    }

    if (e.target.classList.contains('iseentit-btn-delete')) {
      node.querySelector('#iseentit-fab').className = 'iseentit-fab';
      await deleteRecord(node, metadata);
      // Deletion should be a rare case, like when you mark something seent by
      // accident. So just reload the page, that way the data doesn't have to
      // be rehydrated and fabs don't have to rerender. This ain't react bro
      // this some vinalla shit.
      window.location.reload();
      return;
    }

    if (e.target.classList.contains('iseentit-btn-seent')) {
      node.querySelector('#iseentit-fab').className = 'iseentit-seent';
      upsertRecord(node, metadata); // explicitly not await'ing (for UX)
      destroyModal();
      return;
    }

    if (e.target.classList.contains('iseentit-btn-rate')) {
      container.dataset.selectedScreen = 2;
      return;
    }

    if (!e.target.dataset.rating) return;
    if (container.dataset.selectedScreen === '2') {
      RATINGS.rewatchability = e.target.dataset.rating;
      container.dataset.selectedScreen = 3;
    } else {
      node.querySelector('#iseentit-fab').className = 'iseentit-rated';
      RATINGS.artisticMerit = e.target.dataset.rating;
      // explicitly not await'ing (for UX)
      upsertRecord(node, { ...metadata, ...RATINGS });
      destroyModal();
    }
  });

  document.body.appendChild(container);
  requestAnimationFrame(() => {
    container.classList.add('iseentit-animate');
  });
}

function destroyModal () {
  const container = $('.iseentit-modal-container');
  if (!container) return;
  container.addEventListener('transitionend', (e) => {
    if (e.target !== container) return;
    document.body.removeChild(container);
  });
  requestAnimationFrame(() => {
    container.classList.remove('iseentit-animate');
  });
}

// NOTE: That all RT poster lockups and some IMDB lockups do not include year.
function extractMetadata (platform, format, node) {
  let jsonLd;
  let title, year = null;
  switch (platform) {
    case PLATFORMS.IMDB:
      switch (format) {
        case FORMATS.IMDB.DETAIL:
          jsonLd = getJsonLd(document);
          title = jsonLd.name;
          year = releaseDateToYear(jsonLd.datePublished);
          break;
        default:
          title = node.querySelector(`
          .lister-item-header a,
          .titleColumn a,
          [data-testid="title"],
          .ipc-poster-card__title
        `).textContent.trim();
        year = node.querySelector(`
          .lister-item-year,
          .titleColumn .secondaryInfo
        `)?.textContent?.match(/\((\d+)/)[1];
          break;
      }
      break;
    case PLATFORMS.RT:
      switch (format) {
        case FORMATS.RT.SERIES_OVERVIEW:
        case FORMATS.RT.SERIES_SEASON:
          jsonLd = getJsonLd(document);
          title = jsonLd.name;
          break;
        default:
          title = node.querySelector(`
            [class*="Title"],
            [class*="title"],
            .p--small
          `).textContent.trim();
          break;
      }
      break;
  }
  const image = node.querySelector('img').src;
  return { node, platform, title, year, image };
}

function injectFab (platform, format, node) {
  const _isRated = (m) => m && m.rewatchability > 0 && m.artisticMerit > 0;

  const metadata = extractMetadata(platform, format, node);
  // This is necessary because some RT and IMDB poster lockups do not include
  // the year. So if you've seent Metropolis (1927), but you encounter a
  // lockup for Metroplis (2001), the latter will be incorrectly marked
  // seent. Such is life. Detail pages provide a workaround when you need to
  // disambiguate.
  const existingMetadata = getSavedMetadata(metadata.title, metadata.year)
    || PARSED_DATA_BY_TITLE[metadata.title];
  const isSeent = !!existingMetadata;
  const isRated = _isRated(existingMetadata);

  const fab = document.createElement('iseentit');
  fab.id = 'iseentit-fab';
  if (isRated) {
    fab.classList.add('iseentit-rated');
  } else if (isSeent) {
    fab.classList.add('iseentit-seent');
  } else {
    fab.classList.add('iseentit-fab');
    fab.style.backgroundImage = `url("${AVATAR_URL}")`;
  }
  node.appendChild(fab);

  fab.addEventListener('click', (e) => {
    e.stopPropagation(); // Important to prevent videos from playing etc.
    // Metadata extracted on click because image assets aren't ready at runtime.
    createModal(node, extractMetadata(platform, format, node), isSeent);
  });
}

function _pollImdbShovelers() {
  const promise = new Promise((resolve) => {
    const hasCarouselContent = () => {
      if ($$('.feature-row-loader, .rvi-empty-section').length === 0) resolve();
      else setTimeout(hasCarouselContent, 200);
    };
    setTimeout(hasCarouselContent, 200);
  });
  return promise;
}

// TODO: This whole PARSED_DATA thing to get a hashtable lookup is stupid.
// We're working on the order of at most ~2000 items, so just calling a method
// that does a simple Array.find() is more than sufficient. This was a
// premature optimization. It's very useful to parse the condensed data storage
// format to JSON blobs, but it should stay an array. Useless complexity.
chrome.storage.sync.get('iseentit', async function (data) {
  SYNC_DATA = data.iseentit || { FILM: [], SERIES: [] };
  PARSED_DATA = decodeSyncData(SYNC_DATA);

  PARSED_DATA_BY_TITLE = PARSED_DATA.reduce((memo, metadata) => {
    memo[metadata.title] = metadata;
    return memo;
  }, {});

  // IMDB loads "shoveler" carousel content asynchronously, and it's slow as
  // heck. So if we encounter their loaders, poll the page until they are
  // populated before injecting fabs. Weeeeeeeeee.
  const shovelerLoaders = $$('.feature-row-loader, .rvi-empty-section');
  if (shovelerLoaders.length) await _pollImdbShovelers();

  const platform = HOSTS_TO_PLATFORMS[window.location.host];
  for (const [_format, selector] of Object.entries(FORMATS[platform])) {
    // This should have been a proper enum-like structure with a separate map
    // for selectors but whatever same thing.
    // $$(selector).forEach(injectFab.bind(null, platform, format));
    $$(selector).forEach(injectFab.bind(null, platform, selector));
  }
});

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
const FORMATS = {
  IMDB: {
    LISTER: '.lister-item', // "lister" UX, e.g. /search/title/?genres=sci-fi
    LISTER_MINI: '.lister-list > tr', // compact "lister" UX, e.g. Top 250
  },
  RT: {
    BROWSE: '.mb-movie, .media-list__item', // /browse/ pages
    DETAIL: '.thumbnail-scoreboard-wrap', // detail page
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

// PARSED_DATA_BY_TITLE necessary due to combination of RT not including year in
// poster lockups + being severely constrained on storage.
let SYNC_DATA, PARSED_DATA, PARSED_DATA_BY_TITLE;

function makeKeyFromMetadata (metadata) {
  return metadata.year + ':' + metadata.title;
}

/**
 * Stored data format: [1999, "The Green Mile", 5, 5]
 * I.e. [year, title, rewatchability, artistic merit]
 * This condensed data format is due to chrome.storage.sync's 100kb limit.
 * With this format ~2000 movies/shows can be stored. That sounds like a lot
 * but my very incomplete and manually curated list is already approaching
 * 1000 movies.
 */
function decodeSyncData (syncData) {
  const reduceItemArrayToMetadataMap = (type, items=[]) => {
    return items.reduce((memo, item) => {
      const [year, title, rewatchability, artisticMerit] = item;
      const val = {type, year, title, rewatchability, artisticMerit};
      const key = makeKeyFromMetadata(val);
      val.key = key;
      memo[key] = val;
      return memo;
    }, {});
  };
  return {
    FILM: reduceItemArrayToMetadataMap(CONTENT_TYPES.FILM, syncData.FILM),
    SERIES: reduceItemArrayToMetadataMap(CONTENT_TYPES.SERIES, syncData.SERIES),
  };
}

// RT poster lockups don't include the year. -_-
async function _getYear (node, metadata) {
  if (metadata.year) return metadata.year;
  if (metadata.platform === PLATFORMS.RT) {
    const linkTarget = node.querySelector('a').href;
    // Presence of query string in links means we're on the detail page already.
    const fetchTarget = linkTarget.indexOf('?') > -1
      ? window.location.href : linkTarget;
    const detailPage = await fetch(fetchTarget);
    const html = await detailPage.text();
    // yolo
    const matches = new RegExp(/"cag\[release\]":"(\d+)"/, 'g').exec(html);
    return matches[1];
  }
}

// TODO: Should just pass detail page URL instead of node. I.e. call _getYear
// from the caller of upsertRecord. upsertRecord should be ignorant of anything
// but metadata and chrome.storage.sync.
async function upsertRecord (node, metadata) {
  const year = await _getYear(node, metadata);
  const oldData = PARSED_DATA[metadata.type][metadata.key];
  const newData = { ...oldData, ...metadata, year };

  SYNC_DATA[metadata.type] = SYNC_DATA[metadata.type] || []; // first write case

  let recordToUpdate;
  const existingRecord = SYNC_DATA[metadata.type].find((record) => {
    return record[0] === newData.year && record[1] === newData.title;
  });
  if (existingRecord) {
    recordToUpdate = existingRecord;
  } else {
    recordToUpdate = [];
    SYNC_DATA[metadata.type].push(recordToUpdate);
  }

  // Abusing js references here to avoid having to take PARSED_DATA and encode
  // it into a SYNC_DATA object, or otherwise get cute with array splicing etc.
  // This way the SYNC_DATA record just gets updated in place and both the
  // insert/update cases get poked the same way.
  recordToUpdate.length = 0;
  recordToUpdate.push(
    newData.year, newData.title,
    newData.rewatchability || 0, newData.artisticMerit || 0
  );

  return await chrome.storage.sync.set({ 'iseentit': SYNC_DATA });
}

async function deleteRecord (node, metadata) {
  const year = await _getYear(node, metadata);
  const existingRecord = SYNC_DATA[metadata.type].find((record) => {
    return record[0] === year && record[1] === metadata.title;
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
            <!-- iseentit class="iseentit-year">(${metadata.year})</iseentit -->
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

function _getImdbType (format, node) {
  switch (format) {
    case FORMATS.IMDB.LISTER:
      return node.querySelector('.certificate').textContent.indexOf('TV-') === 0
        ? CONTENT_TYPES.SERIES : CONTENT_TYPES.FILM;
    case FORMATS.IMDB.LISTER_MINI:
      // This isn't even yolo territory. This is just terrible. But it works.
      return node.querySelector('a').href.indexOf('tv') > -1
        ? CONTENT_TYPES.SERIES : CONTENT_TYPES.FILM;
  }
}

function extractMetadata (platform, format, node) {
  switch (platform) {
    // TODO: Only working with LISTER format at the moment. For RT different
    // formats were easy to handle below, but for IMDB a second switch statement
    // may be needed etc.
    case PLATFORMS.IMDB: {
      const type = _getImdbType(format, node);
      const title =
        node.querySelector('.lister-item-header a, .titleColumn a').textContent;
      const year =
        node.querySelector('.lister-item-year, .titleColumn .secondaryInfo')
        .textContent.match(/\((\d+)/)[1];
      const metadata = {
        node,
        platform,
        type,
        title,
        year,
        image: node.querySelector('img').src,
      };
      metadata.key = makeKeyFromMetadata(metadata);
      return metadata;
    }
    case PLATFORMS.RT: {
      const type = node.querySelector('a').pathname.indexOf('/m/') === 0
        ? CONTENT_TYPES.FILM : CONTENT_TYPES.SERIES;
      const title = node.querySelector(
        '[class*="Title"], [class*="title"], .p--small').textContent;
      const metadata = {
        node,
        platform,
        type,
        title,
        year: null, // RT doesn't have the year on poster lockups.
        image: node.querySelector('img').src,
      };
      metadata.key = makeKeyFromMetadata(metadata);
      return metadata;
    }
  }
}

function injectFab (platform, format, node) {
  const _isRated = (m) => m && m.rewatchability > 0 && m.artisticMerit > 0;

  const metadata = extractMetadata(platform, format, node);

  let isSeent = false;
  let isRated = false;
  switch (platform) {
    case PLATFORMS.RT:
      // This is necessary for RT because their poster lockups do not include
      // the year. So if you've seent Metropolis (1927), but you encounter a
      // lockup for Metroplis (2001), the latter will be incorrectly marked
      // seent. Not a huge deal, but since IMDB does include year in their
      // lockups there's no reason to allow this bug outside of RT.
      isSeent = metadata.title in PARSED_DATA_BY_TITLE;
      isRated = _isRated(PARSED_DATA_BY_TITLE[metadata.title]);
      break;
    default:
      isSeent = metadata.key in PARSED_DATA[metadata.type];
      isRated = _isRated(PARSED_DATA[metadata.type][metadata.key]);
  }

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

  fab.addEventListener('click', () => {
    // Metadata extracted on click because image assets aren't ready at runtime.
    createModal(node, extractMetadata(platform, format, node), isSeent);
  });
}

// TODO: This whole PARSED_DATA thing to get a hashtable lookup is stupid.
// We're working on the order of at most ~2000 items, so just calling a method
// that does a simple Array.find() is more than sufficient. This was a
// premature optimization. It's very useful to parse the condensed data storage
// format to JSON blobs, but it should stay an array. Useless complexity.
chrome.storage.sync.get('iseentit', function (data) {
  SYNC_DATA = data.iseentit || { FILM: [], SERIES: [] };
  PARSED_DATA = decodeSyncData(SYNC_DATA);

  PARSED_DATA_BY_TITLE = {};
  Object.keys(PARSED_DATA).forEach((contentType) => {
    for (const [_, metadata] of Object.entries(PARSED_DATA[contentType])) {
      PARSED_DATA_BY_TITLE[metadata.title] = metadata;
    }
  });

  const platform = HOSTS_TO_PLATFORMS[window.location.host];
  for (const [_format, selector] of Object.entries(FORMATS[platform])) {
    // This should have been a proper enum-like structure with a separate map
    // for selectors but whatever same thing.
    // $$(selector).forEach(injectFab.bind(null, platform, format));
    $$(selector).forEach(injectFab.bind(null, platform, selector));
  }
});

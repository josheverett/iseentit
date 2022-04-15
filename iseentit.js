const $ = document.querySelector.bind(document);
const $$ = document.querySelectorAll.bind(document);

const CONTENT_TYPES = {
  FILM: 'FILM',
  SERIES: 'SERIES',
};

const PLATFORMS = {
  RT: 'RT',
  IMDB: 'IMDB',
};

// FORMATS[platform][format] --> CSS selector
const FORMATS = {
  RT: {
    BROWSE: '.mb-movie, .media-list__item', // /browse/ pages
    DETAIL: '.thumbnail-scoreboard-wrap', // detail page
    YMAL: 'tiles-carousel-responsive-item', // "YOU MIGHT ALSO LIKE"
  },
};

const HOSTS_TO_PLATFORMS = {
  'www.rottentomatoes.com': PLATFORMS.RT,
  'www.imdb.com': PLATFORMS.IMDB,
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

async function upsert (node, metadata) {
  // RT poster lockups don't include the year. -_-
  if (metadata.platform === PLATFORMS.RT) {
    const detailPage = await fetch(node.querySelector('a').href);
    const html = await detailPage.text();
    // yolo
    const matches = new RegExp(/"cag\[release\]":"(\d+)"/, 'g').exec(html);
    metadata.year = matches[1];
  }

  const oldData = PARSED_DATA[metadata.type][metadata.key];
  const newData = { ...oldData, ...metadata };
  SYNC_DATA[metadata.type] = SYNC_DATA[metadata.type] || [];
  SYNC_DATA[metadata.type].push([
    newData.year, newData.title,
    newData.rewatchability || 0, newData.artisticMerit || 0
  ]);

  return await chrome.storage.sync.set({ 'iseentit': SYNC_DATA });
}

function createRatingLinks (ratings) {
  return ratings.map((rating, i) => {
    return `<iseentit class="iseentit-link" data-rating="${i + 1}">${rating}</iseentit>`;
  }).reverse().join('');
}

function createModal (node, metadata) {
  AUDIO.play();

  const container = document.createElement('iseentit');
  container.className = 'iseentit-modal-container';
  container.dataset.selectedScreen = 1;
  // TODO: "unseent" --> delete record
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
          <iseentit class="iseentit-btn iseentit-btn-seent">I seent it!</iseentit>
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

  container.addEventListener('click', (e) => {
    if (e.target === container) {
      destroyModal();
      return;
    }

    if (e.target.classList.contains('iseentit-btn-seent')) {
      node.querySelector('#iseentit-fab').className = 'iseentit-seent';
      // explicitly not await'ing (for UX)
      upsert(node, metadata);
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
      upsert(node, { ...metadata, ...RATINGS });
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

function extractMetadata (platform, format, node) {
  switch (platform) {
    case PLATFORMS.RT:
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
    createModal(node, extractMetadata(platform, format, node));
  });
}

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
  for (const [format, selector] of Object.entries(FORMATS[platform])) {
    $$(selector).forEach(injectFab.bind(null, platform, format));
  }
});

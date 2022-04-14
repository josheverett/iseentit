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

const HOSTS_TO_PLATFORMS = {
  'www.rottentomatoes.com': PLATFORMS.RT,
  'www.imdb.com': PLATFORMS.IMDB,
};

const RATINGS_STRINGS = {
  rewatchability: [
    `I will never get tired of rewatching this`,
    `I've watched / will watch this many times`,
    `It's worth watching a few times`,
    `It's worth a second viewing`,
    `I never want to watch this again`,
  ],
  artisticMerit: [
    `A cinematic masterpiece`,
    `Oscar-worthy`,
    `A quality film or series`,
    `An average movie or show`,
    `Little to no redeeming artistic qualities`,
  ]
};

const AVATAR_URL = chrome.runtime.getURL('iseentit.png');

const AUDIO = new Audio(chrome.runtime.getURL('iseentit.mp3'));

const RATINGS = { rewatchability: 0, artisticMerit: 0 }; // yolo

// PARSED_DATA_BY_TITLE necessary due to combination of RT not including year in
// poster lockups + being severely constrained on storage.
let SYNC_DATA, PARSED_DATA, PARSED_DATA_BY_TITLE;

const ITEM_DECORATORS = {};

ITEM_DECORATORS.RT = function () {
  $$('tiles-carousel-responsive-item')
    .forEach(injectFab.bind(null, PLATFORMS.RT));
};

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
  // don't need the second argument here. derp.
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
  }).join('');
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

  container.addEventListener('click', async (e) => {
    if (e.target === container) {
      destroyModal();
      return;
    }

    if (e.target.classList.contains('iseentit-btn-seent')) {
      node.querySelector('.iseentit-fab').classList.add('iseentit-seent');
      await upsert(node, metadata);
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
      RATINGS.artisticMerit = e.target.dataset.rating;
      await upsert(node, { ...metadata, ...RATINGS });
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

function extractMetadata (platform, node) {
  switch (platform) {
    case PLATFORMS.RT:
      const type = node.querySelector('a').pathname.indexOf('/m/') === 0
        ? CONTENT_TYPES.FILM : CONTENT_TYPES.SERIES;
      const metadata = {
        node,
        platform,
        type,
        title: node.querySelector('span').textContent,
        year: null, // RT doesn't have the year on poster lockups.
        image: node.querySelector('img').src,
      };
      metadata.key = makeKeyFromMetadata(metadata);
      return metadata;
  }
}

function injectFab (platform, node) {
  const metadata = extractMetadata(platform, node);

  const fab = document.createElement('iseentit');
  fab.style.backgroundImage = `url("${AVATAR_URL}")`;
  fab.classList.add('iseentit-fab');

  let isSeent = false;
  switch (platform) {
    case PLATFORMS.RT:
      isSeent = metadata.title in PARSED_DATA_BY_TITLE;
      break;
    default:
      isSeent = metadata.key in PARSED_DATA[metadata.type];
  }
  if (isSeent) fab.classList.add('iseentit-seent');

  node.appendChild(fab);
  fab.addEventListener('click', () => {
    // Metadata extracted on click because image assets aren't ready at runtime.
    createModal(node, extractMetadata(platform, node));
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
  const itemDecorator = ITEM_DECORATORS[platform];
  itemDecorator();
});

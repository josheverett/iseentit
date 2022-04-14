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

const AVATAR_URL = chrome.runtime.getURL('iseentit.png');

const AUDIO = new Audio(chrome.runtime.getURL('iseentit.mp3'));

let SYNC_DATA, PARSED_DATA;

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
      memo[key] = val;
      return memo;
    }, {});
  };
  return {
    FILM: reduceItemArrayToMetadataMap(CONTENT_TYPES.FILM, syncData.FILM),
    SERIES: reduceItemArrayToMetadataMap(CONTENT_TYPES.SERIES, syncData.SERIES),
  };
}

function upsert (metadata) {
  const key = makeKeyFromMetadata(metadata);
  const oldData = PARSED_DATA[metadata.type][key];
  const newData = { ...oldData, ...metadata };
  SYNC_DATA[metadata.type] = SYNC_DATA[metadata.type] || [];
  SYNC_DATA[metadata.type].push([
    newData.year, newData.title,
    newData.rewatchability || 0, newData.artisticMerit || 0
  ]);
  const json = JSON.stringify(SYNC_DATA);
  chrome.storage.sync.set({ 'iseentit': SYNC_DATA });
}

function createModal (metadata) {
  AUDIO.play();

  const container = document.createElement('iseentit');
  container.className = 'iseentit-modal-container';
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
      <iseentit class="iseentit-title">
        ${metadata.title}
        <iseentit class="iseentit-year">(${metadata.year})</iseentit>
      </iseentit>
      <iseentit class="iseentit-btn iseentit-btn-seent">I seent it!</iseentit>
      <iseentit class="iseentit-btn iseentit-btn-rate">Rate</iseentit>
    </iseentit>
  `;

  container.addEventListener('click', (e) => {
    if (e.target === container) {
      destroyModal();
      return;
    }
    if (e.target.classList.contains('iseentit-btn-seent')) {
      container.classList.add('iseentit-seent');
      upsert(metadata);
      return;
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

function extractMetadata (platform, item) {
  switch (platform) {
    case PLATFORMS.RT:
      const type = item.querySelector('a').pathname.indexOf('/m/') === 0
        ? CONTENT_TYPES.FILM : CONTENT_TYPES.SERIES;
      return {
        node: item,
        type,
        title: item.querySelector('span').textContent,
        // Going to need to fetch the target page and extract year from that
        // or something. Bleh.
        // year: null, // :(
        year: '????',
        image: item.querySelector('img').src,
      };
  }
}

function injectFab (platform, item) {
  const metadata = extractMetadata(platform, item);
  const key = makeKeyFromMetadata(metadata);

  const fab = document.createElement('iseentit');
  fab.style.backgroundImage = `url("${AVATAR_URL}")`;
  fab.classList.add('iseentit-fab');
  if (key in PARSED_DATA[metadata.type]) fab.classList.add('iseentit-seent');

  item.appendChild(fab);
  fab.addEventListener('click', () => {
    // metadata extracted on click because image assets aren't ready at runtime
    createModal(extractMetadata(platform, item));
  });
}

chrome.storage.sync.get('iseentit', function (data) {
  SYNC_DATA = data.iseentit || { FILM: [], SERIES: [] };
  PARSED_DATA = decodeSyncData(SYNC_DATA);
  const platform = HOSTS_TO_PLATFORMS[window.location.host];
  const itemDecorator = ITEM_DECORATORS[platform];
  itemDecorator();
});

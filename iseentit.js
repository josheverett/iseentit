const $ = document.querySelector.bind(document);
const $$ = document.querySelectorAll.bind(document);

const PLATFORMS = {
  RT: 'RT',
  IMDB: 'IMDB',
};

const HOSTS_TO_PLATFORMS = {
  'www.rottentomatoes.com': 'RT',
  'www.imdb.com': 'IMDB',
};

const ITEM_DECORATORS = {};

const AVATAR_URL = chrome.runtime.getURL('iseentit.png');

const AUDIO = new Audio(chrome.runtime.getURL('iseentit.mp3'));

function createModal (metadata) {
  AUDIO.play();
  const container = document.createElement('iseentit');
  container.className = 'iseentit-modal-container';
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
    if (e.target !== container) return;
    destroyModal();
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
    case 'RT':
      return {
        node: item,
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
  const fab = document.createElement('iseentit');
  fab.className = 'iseentit-fab';
  fab.style.backgroundImage = `url("${AVATAR_URL}")`;
  item.appendChild(fab);
  fab.addEventListener('click', () => {
    // metadata extracted on click because image assets aren't ready at runtime
    createModal(extractMetadata(platform, item));
  });
}

ITEM_DECORATORS.RT = function () {
  $$('tiles-carousel-responsive-item').forEach(injectFab.bind(null, 'RT'));
};

const platform = HOSTS_TO_PLATFORMS[window.location.host];
const itemDecorator = ITEM_DECORATORS[platform];
itemDecorator();

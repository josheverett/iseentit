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

const AVATAR_URL = chrome.runtime.getURL('iseentit.jpeg');

const AUDIO = new Audio(chrome.runtime.getURL('iseentit.mp3'));

function createModal (item) {
  AUDIO.play();
  const container = document.createElement('iseentit');
  container.className = 'iseentit-modal-container';
  container.innerHTML = `
    <iseentit class="iseentit-modal">
      <iseentit
        class="iseentit-avatar"
        style="background-image: url('${AVATAR_URL}')"
      >
      </iseentit>
      <iseentit class="iseentit-poster">
        poster
      </iseentit>
      <iseentit class="iseentit-btn iseentit-btn-sneet">Seent It!</iseentit>
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

function injectFab (metadata) {
  const fab = document.createElement('iseentit');
  fab.className = 'iseentit-fab';
  fab.style.backgroundImage = `url("${AVATAR_URL}")`;
  metadata.appendChild(fab);
  // fab.addEventListener('click', () => createModal(metadata.node));
  fab.addEventListener('click', () => createModal(metadata));
}

ITEM_DECORATORS.RT = function () {
  const items = $$('tiles-carousel-responsive-item');

  items.forEach(injectFab);
  // items
  //   .map((item) => {
  //     const href = item.querySelector('a').href; // E.g. /m/true_grit_2010
  //     const year = href.split('_').slice(-1)[0];
  //     return {
  //       node: item,
  //       title: 1,
  //       year,
  //     };
  //   })
  //   .forEach(injectFab);
};

const platform = HOSTS_TO_PLATFORMS[window.location.host];
const itemDecorator = ITEM_DECORATORS[platform];
itemDecorator();

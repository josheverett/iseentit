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

function createModal (item) {
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

function injectFab (item) {
  const fab = document.createElement('iseentit');
  fab.className = 'iseentit-fab';
  fab.style.backgroundImage = `url("${AVATAR_URL}")`;
  item.appendChild(fab);
  fab.addEventListener('click', () => createModal(item));
}

ITEM_DECORATORS.RT = function () {
  const items = $$('tiles-carousel-responsive-item');
  items.forEach(injectFab);
};

const platform = HOSTS_TO_PLATFORMS[window.location.host];
const itemDecorator = ITEM_DECORATORS[platform];
itemDecorator();

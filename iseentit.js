const $$ = document.querySelectorAll.bind(document);

const PLATFORMS = {
  RT: 'RT',
  IMDB: 'IMDB',
};

const HOSTS_TO_PLATFORMS = {
  'www.rottentomatoes.com': 'RT',
  'www.imdb.com': 'IMDB',
};

const UI_DECORATORS = {};

const IMG_URL = chrome.runtime.getURL('iseentit.jpeg');

function injectUi (item) {
  const container = document.createElement('iseentit');
  container.className = 'iseentit-container';
  container.innerHTML = `
    <iseentit
        class="iseentit-fab"
        style="background-image: url('${IMG_URL}')">
    </iseentit>
  `;
  item.appendChild(container);
}

UI_DECORATORS.RT = function () {
  const items = $$('tiles-carousel-responsive-item');
  items.forEach(injectUi);
};

const platform = HOSTS_TO_PLATFORMS[window.location.host];
const uiDecorator = UI_DECORATORS[platform];
uiDecorator();

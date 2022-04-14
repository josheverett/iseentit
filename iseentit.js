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

function injectUi (item) {
  const container = document.createElement('iseentit');
  container.className = 'iseentit-container';
  container.innerHTML = `
    <iseentit class="iseentit-fab">
      sup earf
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

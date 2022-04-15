const $ = document.querySelector.bind(document);
const $$ = document.querySelectorAll.bind(document);

const CONTENT_TYPES = {
  FILM: 'FILM',
  SERIES: 'SERIES',
};

const SORT_FUNCTIONS = {
  YEAR: (a, b) => b.year - a.year || a.title.localeCompare(b.title),
  TITLE: (a, b) => a.title.localeCompare(b.title) || b.year - a.year,
  BEST: (a, b) => {
    const aFloor = Math.min(a.rewatchability, a.artisticMerit);
    const bFloor = Math.min(b.rewatchability, b.artisticMerit);
    return bFloor - aFloor || a.title.localeCompare(b.title);
  },
  WORST: (a, b) => {
    const aFloor = Math.min(a.rewatchability, a.artisticMerit);
    const bFloor = Math.min(b.rewatchability, b.artisticMerit);
    return aFloor - bFloor || a.title.localeCompare(b.title);
  },
};

let SYNC_DATA, PARSED_DATA;

function decodeSyncData (syncData) {
  const itemsToMetadata = (type, items=[]) => {
    return items.map((item) => {
      const [year, title, rewatchability, artisticMerit] = item;
      return {type, year, title, rewatchability, artisticMerit};
    });
  };
  return {
    FILM: itemsToMetadata(CONTENT_TYPES.FILM, syncData.FILM),
    SERIES: itemsToMetadata(CONTENT_TYPES.SERIES, syncData.SERIES),
  };
}

function sortItems (items) {
  const sortFn = SORT_FUNCTIONS[$('#sort').value];
  return [...items].sort(sortFn);
}

function renderTable (tab, items) {
  const node = $(`.tab-pane[data-tab="${tab}"]`);
  node.innerHTML = `
    <table>
      <thead>
        <tr>
          <td>Year</td>
          <td>Title</td>
          <td>Rewatchability</td>
          <td>Artistic Merit</td>
        </tr>
      </thead>
      <tbody>
        ${sortItems(items).map((item) => {
          return `
            <tr>
              <td>${item.year}</td>
              <td>${item.title}</td>
              <td>${item.rewatchability}</td>
              <td>${item.artisticMerit}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function renderTables () {
  renderTable('film', PARSED_DATA.FILM);
  renderTable('series', PARSED_DATA.SERIES);
}

$('.tabs').addEventListener('click', (e) => {
  if (!e.target.dataset.tab) return;
  $$('.tab').forEach((tab) => tab.classList.remove('active'));
  $$('.tab-pane').forEach((pane) => pane.classList.remove('active'));
  $(`.tab[data-tab=${e.target.dataset.tab}]`).classList.add('active');
  $(`.tab-pane[data-tab=${e.target.dataset.tab}]`).classList.add('active');
});

$('#sort').addEventListener('change', renderTables);

$('.btn-clear').addEventListener('click', (e) => {
  const shouldClear = window.confirm(
    'Your I SEENT IT! data is synced to your Chrome profile. Deleting this ' +
    'data will delete it from all of your devices. Are you sure you want to ' +
    'do this?'
  );
  if (!shouldClear) return;
  chrome.storage.sync.clear(() => window.location.reload());
});

chrome.storage.sync.get('iseentit', function (data) {
  SYNC_DATA = data.iseentit || { FILM: [], SERIES: [] };
  PARSED_DATA = decodeSyncData(SYNC_DATA);
  renderTables();
});

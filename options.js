const $ = document.querySelector.bind(document);
const $$ = document.querySelectorAll.bind(document);

const CONTENT_TYPES = {
  FILM: 'FILM',
  SERIES: 'SERIES',
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

// TODO: This needs to be sorted by: year --> title --> (rewatch + merit)
// Not gonna pull in underscore or some shit, do it the old fashioned way.
function createTable (tab, items) {
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
        ${items.map((item) => {
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

$('.tabs').addEventListener('click', (e) => {
  if (!e.target.dataset.tab) return;
  $$('.tab').forEach((tab) => tab.classList.remove('active'));
  $$('.tab-pane').forEach((pane) => pane.classList.remove('active'));
  $(`.tab[data-tab=${e.target.dataset.tab}]`).classList.add('active');
  $(`.tab-pane[data-tab=${e.target.dataset.tab}]`).classList.add('active');
});

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
  createTable('film', PARSED_DATA.FILM);
  createTable('series', PARSED_DATA.SERIES);
});

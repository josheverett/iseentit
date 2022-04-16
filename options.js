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

// this is the most yolo shit ever TRY AND STOP ME
function filterItems (query) {
  $('#yolo').innerHTML = !query ? '' : `
    tbody tr { display: none; }
    tbody tr[data-filter*="${query}"] { display: table-row; }
  `;
}

function renderTable (tab, items) {
  const node = $(`.tab-pane[data-tab="${tab}"]`);
  const ratedItems = items.filter((item) => {
    return item.rewatchability + item.artisticMerit > 0;
  });
  node.innerHTML = `
    <p>
      Total seent: ${items.length}
      &nbsp;&nbsp;&nbsp;&nbsp; <!-- yolo -->
      Total rated: ${ratedItems.length}
    </p>
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
            <tr data-filter="${(item.year + item.title).toLowerCase()}">
              <td>${item.year}</td>
              <td>${item.title}</td>
              <td>${item.rewatchability || 'N/A'}</td>
              <td>${item.artisticMerit || 'N/A'}</td>
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
$('#filter').addEventListener('keyup', (e) => {
  filterItems(e.target.value.toLowerCase().trim());
});

$('.btn-export').addEventListener('click', () => {
  const syncItemsToCsv = (type, items) => {
    return items.map((item) => {
      const year = item[0];
      const title = item[1];
      const rewatchability = item[2];
      const artisticMerit = item[3];
      const hasDoubleQuote = title.includes(`"`);
      const quoteStyle = hasDoubleQuote ? `'` : `"`;
      const _title = `${quoteStyle}${title}${quoteStyle}`;
      return [type, year, _title, rewatchability || 0, artisticMerit || 0]
        .join(',');
    });
  };

  const rows = syncItemsToCsv(CONTENT_TYPES.FILM, SYNC_DATA.FILM)
    .concat(syncItemsToCsv(CONTENT_TYPES.FILM.SERIES, SYNC_DATA.SERIES));
  rows.unshift('Type,Year,Title,Rewatchability,Artistic Merit');
  const csv = rows.join('\n');

  const YYYYMMDD = new Date().toISOString().split('T')[0];
  const link = document.createElement('a');
  link.setAttribute('hidden', true);
  link.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURI(csv));
  link.setAttribute('download', `iseentit-export-${YYYYMMDD}.csv`);
  document.body.appendChild(link);
  link.click();
});

$('.btn-clear').addEventListener('click', () => {
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

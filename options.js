const $ = document.querySelector.bind(document);
const $$ = document.querySelectorAll.bind(document);

$('.tabs').addEventListener('click', (e) => {
  if (!e.target.dataset.tab) return;
  $$('.tab').forEach((tab) => tab.classList.remove('active'));
  $$('.tab-pane').forEach((pane) => pane.classList.remove('active'));
  $(`.tab[data-tab=${e.target.dataset.tab}]`).classList.add('active');
  $(`.tab-pane[data-tab=${e.target.dataset.tab}]`).classList.add('active');
});

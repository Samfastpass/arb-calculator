// Tab switching. Panes are only shown/hidden, so a tab that depends on state
// changed elsewhere must refresh itself when shown (the calculator is rebuilt by
// Calculator.load before the switch, so it is always current).
(function () {
  'use strict';
  function show(name) {
    ['calc', 'scan'].forEach(function (t) {
      document.getElementById('tab-' + t).style.display = t === name ? '' : 'none';
    });
    Array.prototype.forEach.call(document.querySelectorAll('.tabnav .tab'), function (b) {
      b.classList.toggle('active', b.dataset.tab === name);
    });
  }
  document.querySelector('.tabnav').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-tab]'); if (b) show(b.dataset.tab);
  });
  window.showTab = show;
})();

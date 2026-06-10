(function () {
  // Inject nav.html into #nav-container
  fetch('/nav.html')
    .then(function (res) { return res.text(); })
    .then(function (html) {
      document.getElementById('nav-container').innerHTML = html;
      initNav();
    })
    .catch(function () {
      // Fallback: silent fail — page still works without nav
    });

  function initNav() {
    // Scroll border
    var nav = document.getElementById('nav');
    if (nav) {
      window.addEventListener('scroll', function () {
        nav.classList.toggle('scrolled', window.scrollY > 40);
      });
    }

    // Mark active link based on current page
    var path = window.location.pathname;
    var page = path.split('/').pop() || 'index.html';
    var links = document.querySelectorAll('#nav .nav-links a, #nav-mobile a');
    links.forEach(function (link) {
      var href = link.getAttribute('href').replace('/', '');
      if (href === page || (page === '' && href === 'index.html')) {
        link.classList.add('active');
      }
    });

    // Hamburger toggle
    var hamburger = document.getElementById('hamburger');
    var navMobile = document.getElementById('nav-mobile');
    if (hamburger && navMobile) {
      hamburger.addEventListener('click', function () {
        hamburger.classList.toggle('open');
        navMobile.classList.toggle('open');
      });
    }
  }
})();

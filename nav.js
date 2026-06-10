(function () {
  fetch('/nav.html')
    .then(function (res) { return res.text(); })
    .then(function (html) {
      document.getElementById('nav-container').innerHTML = html;
      initNav();
    });

  function initNav() {
    // Scroll border
    var nav = document.getElementById('nav');
    window.addEventListener('scroll', function () {
      nav.classList.toggle('scrolled', window.scrollY > 40);
    });

    // Active link — match current path
    var path = window.location.pathname.replace(/\/$/, '') || '';
    var links = document.querySelectorAll('#nav .nav-links a, #nav-mobile a');
    links.forEach(function (link) {
      var href = link.getAttribute('href').replace(/\/$/, '') || '';
      if (href === path || (path === '' && href === '')) {
        link.classList.add('active');
      }
    });

    // Hamburger
    var hamburger = document.getElementById('hamburger');
    var navMobile = document.getElementById('nav-mobile');
    hamburger.addEventListener('click', function () {
      hamburger.classList.toggle('open');
      navMobile.classList.toggle('open');
    });
  }
})();

/* PrivacyMyst - interaction layer: reveals, header, magnetic, counters, live demo */
(function () {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── sticky header ── */
  const header = document.querySelector('header');
  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 12);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ── scroll reveals ── */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { threshold: 0.14, rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

  /* ── magnetic buttons ── */
  if (!reduce && matchMedia('(pointer:fine)').matches) {
    document.querySelectorAll('.btn').forEach((btn) => {
      btn.addEventListener('pointermove', (e) => {
        const r = btn.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width / 2) / r.width;
        const y = (e.clientY - r.top - r.height / 2) / r.height;
        btn.style.transform = `translate(${x * 8}px, ${y * 8}px)`;
      });
      btn.addEventListener('pointerleave', () => { btn.style.transform = ''; });
    });
  }

  /* ── feature card spotlight ── */
  document.querySelectorAll('.fcard').forEach((c) => {
    c.addEventListener('pointermove', (e) => {
      const r = c.getBoundingClientRect();
      c.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      c.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
  });

  /* ── animated counters ── */
  function animateCount(el) {
    const target = parseFloat(el.dataset.count);
    const dec = parseInt(el.dataset.dec || '0', 10);
    const dur = 1600; const start = performance.now();
    function step(now) {
      const p = Math.min((now - start) / dur, 1);
      const e = 1 - Math.pow(1 - p, 3);
      const val = target * e;
      el.textContent = dec ? val.toFixed(dec) : Math.round(val).toLocaleString();
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  const cio = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { animateCount(e.target); cio.unobserve(e.target); }
    });
  }, { threshold: 0.6 });
  document.querySelectorAll('[data-count]').forEach((el) => cio.observe(el));

  /* ── signed-update pipeline animation ── */
  const psteps = Array.from(document.querySelectorAll('.pstep'));
  if (psteps.length) {
    let runs = 0;
    function runPipe() {
      psteps.forEach((s) => s.classList.remove('on'));
      psteps.forEach((s, i) => setTimeout(() => s.classList.add('on'), 360 + i * 520));
      runs++;
    }
    const pio = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          runPipe();
          if (!reduce) {
            clearInterval(window.__pipe);
            window.__pipe = setInterval(runPipe, psteps.length * 520 + 2400);
          }
        } else {
          clearInterval(window.__pipe);
        }
      });
    }, { threshold: 0.5 });
    pio.observe(document.querySelector('.pipe'));
  }

  /* ── live demo: scan + risk gauge + blocked-tracker feed ── */
  const demo = document.getElementById('demo');
  if (demo) {
    const gaugeNum = demo.querySelector('.gauge .num');
    const gaugeRing = demo.querySelector('#gring');
    const gstatLbl = demo.querySelector('#gstat');
    const feedList = demo.querySelector('.feed-list');
    const feedCount = demo.querySelector('#feedcount');
    const scan = demo.querySelector('.scan');
    const page = demo.querySelector('.demo-page');
    const pinBadge = demo.querySelector('.ext-pin .badge');
    const RING_LEN = 2 * Math.PI * 42;

    const threats = [
      ['doubleclick.net', 'tracker', 'fi tracker'],
      ['scorecardresearch.com', 'tracker', 'fi tracker'],
      ['fingerprintjs.io', 'fp', 'fi fp'],
      ['facebook.com/tr', 'tracker', 'fi tracker'],
      ['cdn.malware-host.ru', 'mal', 'fi mal'],
      ['analytics.tiktok.com', 'tracker', 'fi tracker'],
      ['canvas-probe.adtech.io', 'fp', 'fi fp'],
      ['pixel.rubiconproject.com', 'tracker', 'fi tracker'],
      ['hotjar.com', 'tracker', 'fi tracker'],
      ['x-phish-login.click', 'mal', 'fi mal'],
    ];
    const kindMap = { tracker: 'tracker', fp: 'fingerprint', mal: 'malware' };

    let blocked = 0;
    let risk = 0;
    let timer = null;

    function setGauge(v) {
      gaugeNum.textContent = Math.round(v);
      const off = RING_LEN * (1 - v / 100);
      gaugeRing.style.strokeDashoffset = off;
      let lbl = 'Low exposure', col = '#6EE7B7';
      if (v >= 70) { lbl = 'High - profiling'; col = '#FF6B8A'; }
      else if (v >= 40) { lbl = 'Elevated'; col = '#FFB454'; }
      gaugeRing.style.stroke = col;
      gstatLbl.textContent = lbl;
      gstatLbl.style.color = col;
    }
    setGauge(0);

    function addRow(t) {
      const row = document.createElement('div');
      row.className = 'frow';
      row.innerHTML = `<span class="${t[2]}"></span><span class="dom">${t[0]}</span><span class="kind">${kindMap[t[1]]}</span>`;
      feedList.prepend(row);
      while (feedList.children.length > 6) feedList.lastChild.remove();
    }

    function popTag(text) {
      const tag = document.createElement('div');
      tag.className = 'blocktag';
      tag.textContent = '⊘ ' + text;
      tag.style.left = (24 + Math.random() * 50) + '%';
      tag.style.top = (28 + Math.random() * 46) + '%';
      page.appendChild(tag);
      requestAnimationFrame(() => {
        tag.style.transition = 'opacity .4s, transform .9s cubic-bezier(.16,1,.3,1)';
        tag.style.opacity = '1';
        tag.style.transform = 'scale(1) translateY(-6px)';
      });
      setTimeout(() => { tag.style.opacity = '0'; tag.style.transform = 'scale(.9) translateY(-18px)'; }, 1400);
      setTimeout(() => tag.remove(), 1900);
    }

    function runScan() {
      // sweep
      scan.style.transition = 'none';
      scan.style.top = '-130px';
      requestAnimationFrame(() => {
        scan.style.transition = 'top 2.2s cubic-bezier(.45,0,.55,1)';
        scan.style.top = '110%';
      });
      // ramp risk
      let rt = 0;
      const riskTarget = 84;
      const riskTimer = setInterval(() => {
        rt += 4;
        risk = Math.min(rt, riskTarget);
        setGauge(risk);
        if (rt >= riskTarget) clearInterval(riskTimer);
      }, 60);
      // stream blocks
      let i = 0;
      const stream = setInterval(() => {
        const t = threats[i % threats.length];
        addRow(t);
        popTag(t[0]);
        blocked++;
        feedCount.textContent = blocked;
        if (pinBadge) pinBadge.textContent = Math.min(blocked, 99);
        i++;
        if (i >= 7) {
          clearInterval(stream);
          setTimeout(loop, 2600);
        }
      }, 460);
    }

    function loop() {
      // reset
      blocked = 0; risk = 0;
      feedCount.textContent = '0';
      if (pinBadge) pinBadge.textContent = '0';
      feedList.innerHTML = '';
      setGauge(0);
      runScan();
    }

    let started = false;
    const dio = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting && !started) { started = true; setTimeout(loop, 500); }
      });
    }, { threshold: 0.35 });
    dio.observe(demo);
  }

  /* ── year ── */
  const y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();
})();

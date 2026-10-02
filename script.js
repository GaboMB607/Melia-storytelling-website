/* ==========================================================================
   Melia — Miel de Mieles
   Scrollytelling con GSAP 3.12.5 + ScrollTrigger. Scroll 100 % nativo:
   ninguna librería intercepta la rueda del ratón ni el gesto táctil.

   Arquitectura
   · Siempre activo: año del footer, letras que ruedan, control del video
     y enlaces internos. No dependen de GSAP.
   · Animaciones (hero fijado, tarjetas con títulos en Adelia que se escriben,
     revelados de imágenes, malla de panal, hexágonos flotantes, franja
     cinética y CTA magnético): se crean dentro de un gsap.context() sin
     ninguna condición de pantalla ni de dispositivo,
     así funcionan igual en móvil, portátil y monitores de 1920 px o más.
     Si algo falla, el contexto se revierte y queda la versión estática.
   · Todos los selectores son clases que existen en index.html.
   ========================================================================== */

// Refresco secundario: en cuanto el video del hero carga sus metadatos se
// recalculan las posiciones, sin bloquear el arranque.
{
  const heroVideo = document.querySelector('.hero-video');
  if (heroVideo) {
    heroVideo.addEventListener('loadedmetadata', () => {
      if (window.ScrollTrigger) ScrollTrigger.refresh();
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  /* ------------------------------------------------------------------------
     GSAP + ScrollTrigger. Se comprueba que el CDN haya cargado: si fallara,
     el resto de la página (video, menú, enlaces) sigue funcionando.
     ------------------------------------------------------------------------ */
  const hasGSAP = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';

  if (hasGSAP) {
    gsap.registerPlugin(ScrollTrigger);

    // Configuración global para evitar bloqueos
    ScrollTrigger.config({
      autoRefreshEvents: 'visibilitychange,DOMContentLoaded,load,resize',
      ignoreMobileResize: true,
    });
  }

  const root = document.documentElement;

  /* ------------------------------------------------------------------------
     Interruptor de accesibilidad
     · false (actual): las animaciones se ven siempre, en todas las pantallas,
       aunque el sistema tenga activado "reducir movimiento" (en Windows:
       Configuración > Accesibilidad > Efectos visuales > Efectos de animación).
     · true: quien active "reducir movimiento" ve la versión estática.
     ------------------------------------------------------------------------ */
  const RESPECT_REDUCED_MOTION = false;

  const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';
  const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)';

  const reducedMotionApplies = () => RESPECT_REDUCED_MOTION && window.matchMedia(REDUCED_QUERY).matches;

  // Efecto "escritura" de Adelia: cada palabra se revela de izquierda a derecha.
  // Los valores negativos dejan espacio a los trazos que sobresalen de la caja.
  const INK_FROM = 'inset(-100% 140% -100% -40%)';
  const INK_TO = 'inset(-100% -40% -100% -40%)';

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

  // Textos divididos en palabras, para restaurarlos si se desmontan las animaciones.
  const splitTexts = [];

  // true mientras las animaciones están montadas
  let motionActive = false;
  let removeMagnetic = () => {};

  /* ------------------------------------------------------------------------
     Arranque
     ------------------------------------------------------------------------ */
  // Las transiciones CSS (hover, letras que ruedan) solo se apagan si se
  // respeta "reducir movimiento" y el usuario lo tiene activado.
  root.classList.toggle('reduce-motion', reducedMotionApplies());

  setYear();
  initRoll();
  initHeroVideo();
  initAnchors();
  initBuyButtons();

  if (!hasGSAP || reducedMotionApplies()) {
    root.classList.remove('motion-ok');
    markReady();
    return;
  }

  // Un único contexto agrupa todas las animaciones y ScrollTriggers.
  // No hay matchMedia: nada depende del ancho de pantalla.
  let motionError = null;

  const ctx = gsap.context(() => {
    try {
      setupMotion();
    } catch (error) {
      motionError = error;
    }
  });

  if (motionError) {
    console.error('[Melia] Animaciones desactivadas por un error:', motionError);
    ctx.revert();
    teardownMotion();
  }

  // Las fuentes cambian alturas: recalcular posiciones cuando estén listas.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      if (motionActive) ScrollTrigger.refresh();
    });
  }

  markReady();

  /* ------------------------------------------------------------------------
     Movimiento
     ------------------------------------------------------------------------ */
  function setupMotion() {
    root.classList.add('motion-ok');
    motionActive = true;

    removeMagnetic = initMagnetic();

    initHoneycomb();
    initHero();
    initNav();
    initChapters();
    initMedia();
    initMockup();
    initKinetic();
    initFooter();
    playIntro();

    // Todas las animaciones están declaradas: se calculan las posiciones definitivas.
    ScrollTrigger.refresh();
  }

  // Deja la página en su versión estática (solo si el montaje falló).
  function teardownMotion() {
    removeMagnetic();
    restoreSplitTexts();
    $$('.nav-link').forEach((link) => {
      link.classList.remove('is-active');
      link.removeAttribute('aria-current');
    });
    root.classList.remove('motion-ok');
    motionActive = false;
  }

  /* ------------------------------------------------------------------------
     Entrada inicial: el marco se abre, aparece la navegación y el eslogan
     se escribe palabra por palabra
     ------------------------------------------------------------------------ */
  function playIntro() {
    gsap.timeline({ defaults: { ease: 'expo.out' } })
      .fromTo('.hero-reveal',
        { clipPath: 'inset(9% 9% 9% 9% round 32px)' },
        { clipPath: 'inset(0% 0% 0% 0% round 0px)', duration: 1.8, ease: 'expo.inOut' }, 0)
      .fromTo('.hero-video',
        { scale: 1.18 },
        { scale: 1, duration: 2.8 }, 0.1)
      .fromTo('.site-header',
        { autoAlpha: 0, y: -20 },
        { autoAlpha: 1, y: 0, duration: 1.2 }, 0.7)
      .fromTo('.video-toggle',
        { autoAlpha: 0, scale: 0.8 },
        { autoAlpha: 1, scale: 1, duration: 1 }, 1.6);

    writeIn($('.hero-title'), { delay: 1.05, duration: 1, stagger: 0.18 });
  }

  /* ------------------------------------------------------------------------
     Hero fijado: el video se encoge y se desvanece mientras sube el texto.
     El pin dura el 80 % de la pantalla y luego libera el recorrido vertical.
     ------------------------------------------------------------------------ */
  function initHero() {
    const hero = $('.hero');
    if (!hero) return;

    const frame = $('.hero-frame', hero);
    const overlay = $$('.hero-caption, .video-toggle', hero);
    const introTitle = $('.intro-title', hero);
    const introWords = splitWords($('.intro-sub', hero));

    gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: hero,
        start: 'top top',
        end: '+=80%',
        scrub: 0.5,
        pin: true,
        anticipatePin: 1,
        invalidateOnRefresh: true,
      },
    })
      // El video se desvanece antes de que el texto llegue al centro (legibilidad).
      .to(frame, { scale: 0.86, duration: 1 }, 0)
      .to(frame, { opacity: 0.14, duration: 0.55 }, 0)
      // Valores explícitos para no heredar el estado de la animación de entrada.
      .fromTo(overlay,
        { autoAlpha: 1, y: 0 },
        { autoAlpha: 0, y: -32, duration: 0.3, immediateRender: false }, 0)
      // El título sube y pasa de desenfocado a nítido.
      .fromTo(introTitle,
        { autoAlpha: 0, y: () => window.innerHeight * 0.4, scale: 0.94, filter: 'blur(14px)' },
        { autoAlpha: 1, y: 0, scale: 1, filter: 'blur(0px)', duration: 0.6, ease: 'power2.out' }, 0.2)
      // El subtítulo aparece palabra por palabra.
      .fromTo(introWords,
        { autoAlpha: 0, y: 20 },
        { autoAlpha: 1, y: 0, duration: 0.25, stagger: 0.015, ease: 'power2.out' }, 0.55)
      .to({}, { duration: 0.2 });
  }

  /* ------------------------------------------------------------------------
     Fondo: la malla de panal se desplaza despacio durante toda la página y
     cada hexágono flota sin parar y hace parallax según su profundidad
     ------------------------------------------------------------------------ */
  function initHoneycomb() {
    const mesh = $('.honeycomb-mesh');
    if (mesh) {
      gsap.fromTo(mesh,
        { y: 0 },
        {
          y: () => -window.innerHeight * 0.3,
          ease: 'none',
          scrollTrigger: { start: 0, end: 'max', scrub: 0.8, invalidateOnRefresh: true },
        });
    }

    $$('.hex').forEach((hex, index) => {
      const shape = $('.hex-shape', hex);
      if (!shape) return;

      // data-depth: más alto = más cerca = más recorrido de parallax
      const depth = parseFloat(hex.dataset.depth) || 1;
      const travel = () => window.innerHeight * 0.16 * depth;
      const direction = index % 2 ? 1 : -1;

      // Aparece y crece al acercarse (fade-in + escala)
      gsap.fromTo(shape,
        { autoAlpha: 0, scale: 0.5 },
        {
          autoAlpha: 1,
          scale: 1,
          duration: 1.6,
          ease: 'expo.out',
          scrollTrigger: { trigger: hex, start: 'top 95%', once: true },
        });

      // Parallax vertical con el scroll
      gsap.fromTo(shape,
        { y: () => travel() },
        {
          y: () => -travel(),
          ease: 'none',
          scrollTrigger: { trigger: hex, start: 'top bottom', end: 'bottom top', scrub: 0.8, invalidateOnRefresh: true },
        });

      // Flotación continua (propiedades distintas: no choca con el parallax)
      gsap.to(shape, {
        yPercent: 10 * direction,
        rotation: 9 * -direction,
        duration: 4 + (index % 4) * 0.8,
        delay: index * 0.35,
        ease: 'sine.inOut',
        repeat: -1,
        yoyo: true,
      });
    });
  }

  /* ------------------------------------------------------------------------
     Navegación: barra de progreso de lectura y capítulo activo
     ------------------------------------------------------------------------ */
  function initNav() {
    gsap.fromTo('.nav-progress',
      { scaleX: 0 },
      { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: 0.3 } });

    $$('.nav-link').forEach((link) => {
      const target = document.getElementById(link.getAttribute('href').slice(1));
      if (!target) return;

      ScrollTrigger.create({
        trigger: target,
        start: 'top center',
        end: 'bottom center',
        onToggle: ({ isActive }) => {
          link.classList.toggle('is-active', isActive);
          if (isActive) link.setAttribute('aria-current', 'true');
          else link.removeAttribute('aria-current');
        },
      });
    });
  }

  /* ------------------------------------------------------------------------
     Capítulos: la tarjeta sube con fade-in, el icono rebota, el número se
     cierra, el título en Adelia se escribe y el texto se enciende palabra a
     palabra con el scroll
     ------------------------------------------------------------------------ */
  function initChapters() {
    $$('.chapter').forEach((chapter) => {
      const onEnter = () => ({ trigger: chapter, start: 'top 72%', once: true });

      const card = $('.chapter-card', chapter);
      if (card) {
        gsap.fromTo(card,
          { autoAlpha: 0, y: 70 },
          { autoAlpha: 1, y: 0, duration: 1.4, ease: 'expo.out', scrollTrigger: onEnter() });
      }

      const icon = $('.chapter-icon', chapter);
      if (icon) {
        gsap.fromTo(icon,
          { autoAlpha: 0, scale: 0.4, rotate: -30, y: 12 },
          { autoAlpha: 1, scale: 1, rotate: 0, y: 0, duration: 1.3, delay: 0.2, ease: 'back.out(1.8)', scrollTrigger: onEnter() });
      }

      const numeral = $('.chap-num', chapter);
      if (numeral) {
        gsap.fromTo(numeral,
          { autoAlpha: 0, letterSpacing: '0.9em' },
          { autoAlpha: 1, letterSpacing: '0.2em', duration: 1.6, delay: 0.3, ease: 'expo.out', scrollTrigger: onEnter() });
      }

      writeIn($('.chap-title-adelia', chapter), { delay: 0.45, scrollTrigger: onEnter });
      highlightWords($('.chapter-text', chapter));
    });

    $$('.thread-line').forEach((line) => {
      gsap.fromTo(line,
        { scaleY: 0 },
        {
          scaleY: 1,
          ease: 'none',
          scrollTrigger: { trigger: line, start: 'top 85%', end: 'bottom 45%', scrub: 0.5 },
        });
    });
  }

  /* ------------------------------------------------------------------------
     Imágenes: el marco se abre al entrar, la foto hace parallax y el color
     acompaña la historia (cap. II se apaga, cap. III vuelve a la vida)
     ------------------------------------------------------------------------ */
  function initMedia() {
    $$('.chapter-media').forEach((figure) => {
      const frame = $('.media-frame', figure);
      const image = $('.media-img', figure);
      if (!frame || !image) return;

      const radius = () => getComputedStyle(frame).borderTopLeftRadius;

      gsap.fromTo(frame,
        { clipPath: () => `inset(12% 9% 12% 9% round ${radius()})` },
        {
          clipPath: () => `inset(0% 0% 0% 0% round ${radius()})`,
          ease: 'none',
          scrollTrigger: { trigger: figure, start: 'top bottom', end: 'top 30%', scrub: 0.5, invalidateOnRefresh: true },
        });

      gsap.fromTo(image,
        { yPercent: -6, scale: 1.12 },
        {
          yPercent: 6,
          scale: 1,
          ease: 'none',
          scrollTrigger: { trigger: figure, start: 'top bottom', end: 'bottom top', scrub: 0.5 },
        });

      const tone = figure.dataset.tone;

      if (tone === 'fade') {
        gsap.fromTo(image,
          { filter: 'grayscale(0) brightness(1)' },
          {
            filter: 'grayscale(1) brightness(0.86)',
            ease: 'none',
            scrollTrigger: { trigger: figure, start: 'top 65%', end: 'bottom 35%', scrub: 0.5 },
          });
      }

      if (tone === 'bloom') {
        gsap.fromTo(image,
          { filter: 'grayscale(1) brightness(0.9)' },
          {
            filter: 'grayscale(0) brightness(1)',
            ease: 'none',
            scrollTrigger: { trigger: figure, start: 'top 75%', end: 'center 45%', scrub: 0.5 },
          });
      }
    });
  }

  /* ------------------------------------------------------------------------
     Mockup oficial (cap. IV): sube y se endereza al entrar, y luego flota
     suavemente con el scroll
     ------------------------------------------------------------------------ */
  function initMockup() {
    $$('.chapter-media--mockup').forEach((figure) => {
      const mockup = $('.melia-mockup-img', figure);
      if (!mockup) return;

      gsap.fromTo(mockup,
        { autoAlpha: 0, y: 90, scale: 0.9, rotate: -2 },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          rotate: 0,
          duration: 1.6,
          ease: 'expo.out',
          scrollTrigger: { trigger: figure, start: 'top 85%', once: true },
        });

      gsap.fromTo(mockup,
        { yPercent: 5 },
        {
          yPercent: -5,
          ease: 'none',
          scrollTrigger: { trigger: figure, start: 'top bottom', end: 'bottom top', scrub: 0.6 },
        });
    });
  }

  /* ------------------------------------------------------------------------
     Franja cinética: el eslogan avanza en horizontal con el scroll
     ------------------------------------------------------------------------ */
  function initKinetic() {
    const band = $('.kinetic');
    const track = $('.kinetic-track');
    if (!band || !track) return;

    gsap.fromTo(track,
      { x: () => window.innerWidth * 0.2 },
      {
        x: () => -track.scrollWidth * 0.3,
        ease: 'none',
        scrollTrigger: { trigger: band, start: 'top bottom', end: 'bottom top', scrub: 0.6, invalidateOnRefresh: true },
      });
  }

  /* ------------------------------------------------------------------------
     Footer: reveal suave al llegar al final de la página
     ------------------------------------------------------------------------ */
  function initFooter() {
    const footer = $('.footer');
    if (!footer) return;

    const onEnter = () => ({ trigger: footer, start: 'top 72%', once: true });

    // Se anima la imagen (no su contenedor) para que el fundido con el
    // fondo de panal (mix-blend-mode) siga funcionando.
    gsap.fromTo($('.footer-logo img', footer),
      { autoAlpha: 0, y: 30, scale: 0.9, rotate: -6 },
      { autoAlpha: 1, y: 0, scale: 1, rotate: 0, duration: 1.6, ease: 'expo.out', scrollTrigger: onEnter() });

    writeIn($('.footer-title', footer), { delay: 0.3, duration: 1.2, scrollTrigger: onEnter });

    gsap.fromTo(splitWords($('.footer-sub', footer)),
      { autoAlpha: 0, y: 18, filter: 'blur(6px)' },
      {
        autoAlpha: 1,
        y: 0,
        filter: 'blur(0px)',
        duration: 1,
        stagger: 0.05,
        delay: 1.1,
        ease: 'power3.out',
        scrollTrigger: onEnter(),
      });

    gsap.fromTo($('.footer-cta', footer),
      { autoAlpha: 0, y: 24 },
      { autoAlpha: 1, y: 0, duration: 1.4, delay: 1.4, ease: 'expo.out', scrollTrigger: onEnter() });

    gsap.fromTo($('.footer-bar', footer),
      { autoAlpha: 0 },
      { autoAlpha: 1, duration: 1.2, delay: 1.6, scrollTrigger: onEnter() });
  }

  /* ------------------------------------------------------------------------
     CTA magnético (solo con cursor fino). Devuelve su limpieza.
     ------------------------------------------------------------------------ */
  function initMagnetic() {
    if (!window.matchMedia(FINE_POINTER_QUERY).matches) return () => {};

    const strength = 0.25;
    const removers = $$('.magnetic').map((element) => {
      const xTo = gsap.quickTo(element, 'x', { duration: 0.6, ease: 'power3.out' });
      const yTo = gsap.quickTo(element, 'y', { duration: 0.6, ease: 'power3.out' });

      const onMove = (event) => {
        const rect = element.getBoundingClientRect();
        xTo((event.clientX - (rect.left + rect.width / 2)) * strength);
        yTo((event.clientY - (rect.top + rect.height / 2)) * strength);
      };
      const onLeave = () => {
        xTo(0);
        yTo(0);
      };

      element.addEventListener('pointermove', onMove);
      element.addEventListener('pointerleave', onLeave);

      return () => {
        element.removeEventListener('pointermove', onMove);
        element.removeEventListener('pointerleave', onLeave);
      };
    });

    return () => removers.forEach((remove) => remove());
  }

  /* ------------------------------------------------------------------------
     Efectos de texto
     ------------------------------------------------------------------------ */

  // Divide un texto en <span class="word">. Las palabras quedan completas, así
  // las letras enlazadas de Adelia no se separan y los lectores de pantalla
  // leen la frase igual que antes.
  function splitWords(element) {
    if (!element) return [];

    const text = element.textContent.trim().replace(/\s+/g, ' ');
    splitTexts.push({ element, text });
    element.textContent = '';

    return text.split(' ').map((word, index) => {
      if (index > 0) element.append(' ');
      const span = document.createElement('span');
      span.className = 'word';
      span.textContent = word;
      element.append(span);
      return span;
    });
  }

  function restoreSplitTexts() {
    splitTexts.splice(0).forEach(({ element, text }) => {
      element.textContent = text;
    });
  }

  // Títulos en Adelia: las palabras se "escriben" una tras otra.
  function writeIn(element, { delay = 0, duration = 0.9, stagger = 0.16, scrollTrigger } = {}) {
    const words = splitWords(element);
    if (!words.length) return;

    gsap.set(element, { autoAlpha: 1 });
    gsap.fromTo(words,
      { clipPath: INK_FROM, x: -8 },
      {
        clipPath: INK_TO,
        x: 0,
        duration,
        delay,
        stagger,
        ease: 'power2.inOut',
        clearProps: 'clipPath',
        scrollTrigger: scrollTrigger ? scrollTrigger() : undefined,
      });
  }

  // Texto de capítulo: las palabras se encienden a medida que avanza el scroll.
  function highlightWords(element) {
    const words = splitWords(element);
    if (!words.length) return;

    gsap.fromTo(words,
      { opacity: 0.16 },
      {
        opacity: 1,
        ease: 'none',
        stagger: 0.1,
        scrollTrigger: { trigger: element, start: 'top 82%', end: 'bottom 50%', scrub: true },
      });
  }

  /* ------------------------------------------------------------------------
     Siempre activo (no depende de GSAP)
     ------------------------------------------------------------------------ */

  // Letras que ruedan al pasar el cursor. La animación vive en style.css.
  function initRoll() {
    $$('.roll-label').forEach((label) => {
      const text = label.textContent.trim();
      const host = label.closest('a, button');
      if (host && !host.hasAttribute('aria-label')) host.setAttribute('aria-label', text);

      label.setAttribute('aria-hidden', 'true');
      label.textContent = '';

      Array.from(text).forEach((char, index) => {
        const span = document.createElement('span');
        span.className = 'roll-char';
        span.style.setProperty('--i', index);
        span.textContent = char;
        label.appendChild(span);
      });
    });
  }

  // Video del hero: botón de pausa (WCAG 2.2.2) y pausa automática fuera de pantalla.
  function initHeroVideo() {
    const video = $('.hero-video');
    const button = $('.video-toggle');
    const frame = $('.hero-frame');
    if (!video || !button) return;

    let pausedByUser = reducedMotionApplies();
    let inView = true;

    const sync = () => {
      const paused = video.paused;
      button.dataset.state = paused ? 'paused' : 'playing';
      button.setAttribute('aria-label', paused ? 'Reproducir video' : 'Pausar video');
    };

    const play = () => {
      if (!pausedByUser && inView) video.play().catch(() => {});
    };

    video.addEventListener('play', sync);
    video.addEventListener('pause', sync);

    button.addEventListener('click', () => {
      if (video.paused) {
        pausedByUser = false;
        play();
      } else {
        pausedByUser = true;
        video.pause();
      }
    });

    if (pausedByUser) {
      video.removeAttribute('autoplay');
      video.pause();
    }

    if ('IntersectionObserver' in window && frame) {
      new IntersectionObserver(([entry]) => {
        inView = entry.isIntersecting;
        if (inView) play();
        else video.pause();
      }).observe(frame);
    }

    sync();
  }

  // Enlaces internos: scroll nativo (suave solo si hay animaciones)
  // y foco accesible en el destino.
  function initAnchors() {
    document.addEventListener('click', (event) => {
      const link = event.target.closest('a[href^="#"]');
      if (!link) return;

      const hash = link.getAttribute('href');
      const target = hash.length > 1 ? document.getElementById(hash.slice(1)) : null;
      if (!target) return;

      event.preventDefault();

      const top = hash === '#inicio' ? 0 : target.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top, behavior: motionActive ? 'smooth' : 'auto' });
      target.focus({ preventScroll: true });
      history.replaceState(null, '', hash);
    });
  }

  // Botones "Comprar ahora": redirección directa a la tienda oficial.
  // Ctrl/Cmd/Shift + clic conservan su comportamiento (abrir en otra pestaña o ventana).
  function initBuyButtons() {
    const STORE_URL = 'https://gabomb607.github.io/Melia-Website-store-FN/';
    const buyButtons = $$('#buy-now-btn, .btn-comprar, a[href*="github.io"]');

    buyButtons.forEach((buyButton) => {
      buyButton.addEventListener('click', (e) => {
        if (e.ctrlKey || e.metaKey || e.shiftKey) return;
        e.preventDefault();
        window.location.href = STORE_URL;
      });
    });
  }

  function setYear() {
    const year = $('.year');
    if (year) year.textContent = String(new Date().getFullYear());
  }

  function markReady() {
    window.__melia = true;
  }
});

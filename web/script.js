/**
 * HSDental · script.js
 * Funcionalidades:
 *  1. Navbar scroll (sombra + clase activa en links)
 *  2. Menú móvil (hamburguesa)
 *  3. Scroll suave (ya gestionado por CSS scroll-behavior)
 *  4. Scroll Reveal (IntersectionObserver)
 *  5. Contador animado de estadísticas
 *  6. Carrusel de testimonios
 *  7. Validación y envío del formulario (simulado)
 *  8. Botón "Volver arriba"
 *  9. Año dinámico en el footer
 */

'use strict';

/* ----------------------------------------------------------------
   Utilidades
   ---------------------------------------------------------------- */

/**
 * Selector abreviado (equivalente a querySelector/All).
 * @param {string} sel - Selector CSS
 * @param {Document|Element} [ctx=document]
 * @returns {Element|null}
 */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

/* ----------------------------------------------------------------
   1. NAVBAR — sombra al hacer scroll + link activo
   ---------------------------------------------------------------- */
(function initNavbar() {
  const navbar = $('#navbar');
  const navLinks = $$('.navbar__link');
  const sections = $$('main section[id]');

  if (!navbar) return;

  /* Añade sombra cuando el usuario ha scrolleado */
  const handleScroll = () => {
    const scrolled = window.scrollY > 20;
    navbar.classList.toggle('is-scrolled', scrolled);

    /* Resalta el link de la sección visible */
    let currentId = '';
    sections.forEach(sec => {
      if (window.scrollY >= sec.offsetTop - 120) {
        currentId = sec.getAttribute('id');
      }
    });

    navLinks.forEach(link => {
      const href = link.getAttribute('href')?.replace('#', '');
      link.classList.toggle('is-active', href === currentId);
    });
  };

  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll(); // run on load
})();

/* ----------------------------------------------------------------
   2. MENÚ MÓVIL (hamburguesa)
   ---------------------------------------------------------------- */
(function initMobileMenu() {
  const toggle = $('#menu-toggle');
  const nav    = $('#main-nav');

  if (!toggle || !nav) return;

  toggle.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', isOpen.toString());
    toggle.setAttribute('aria-label', isOpen ? 'Cerrar menú' : 'Abrir menú');
    // Evita scroll del body cuando el menú está abierto
    document.body.style.overflow = isOpen ? 'hidden' : '';
  });

  /* Cierra el menú al hacer clic en un link */
  $$('.navbar__link', nav).forEach(link => {
    link.addEventListener('click', () => {
      nav.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Abrir menú');
      document.body.style.overflow = '';
    });
  });

  /* Cierra el menú al redimensionar a escritorio */
  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) {
      nav.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }
  });
})();

/* ----------------------------------------------------------------
   3. SCROLL REVEAL con IntersectionObserver
   ---------------------------------------------------------------- */
(function initScrollReveal() {
  const elements = $$('.reveal');

  if (!elements.length) return;

  // Respeta la preferencia de reducción de movimiento
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) {
    elements.forEach(el => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target); // observar solo una vez
      }
    });
  }, {
    threshold: 0.1,      // se activa cuando el 10% del elemento es visible
    rootMargin: '0px 0px -60px 0px'
  });

  elements.forEach(el => observer.observe(el));
})();

/* ----------------------------------------------------------------
   4. CONTADOR ANIMADO DE ESTADÍSTICAS (sección Trust)
   ---------------------------------------------------------------- */
(function initCounters() {
  const trustSection = $('.trust');
  const statNums = $$('.stat-card__num[data-target]');

  if (!trustSection || !statNums.length) return;

  let animated = false;

  /**
   * Anima un número desde 0 hasta `target` en `duration` ms.
   * @param {HTMLElement} el - Elemento donde se muestra el número
   * @param {number} target - Valor final
   * @param {number} duration - Duración en ms
   */
  const animateCount = (el, target, duration = 1800) => {
    const start = performance.now();
    const step = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Easing: easeOutExpo
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const current = Math.round(eased * target);

      // Añade sufijo "+" para números grandes o "%"
      const label = el.closest('.stat-card')?.querySelector('.stat-card__label')?.textContent || '';
      const suffix = label.includes('%') ? '%' : (target > 10 ? '+' : '+');
      el.textContent = current + suffix;

      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !animated) {
        animated = true;
        // Activa las barras de progreso
        trustSection.classList.add('is-counted');
        // Anima cada número
        statNums.forEach(el => {
          const target = parseInt(el.getAttribute('data-target'), 10);
          animateCount(el, target);
        });
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.3 });

  observer.observe(trustSection);
})();

/* ----------------------------------------------------------------
   5. CARRUSEL DE TESTIMONIOS
   ---------------------------------------------------------------- */
(function initCarousel() {
  const track     = $('#testimonials-track');
  const dotsWrap  = $('#testimonials-dots');
  const prevBtn   = $('#prev-btn');
  const nextBtn   = $('#next-btn');

  if (!track || !prevBtn || !nextBtn) return;

  const cards        = $$('.testimonial-card', track);
  const totalCards   = cards.length;
  let currentIndex   = 0;
  let autoplayTimer  = null;

  /* Calcula cuántas tarjetas caben según el ancho de la ventana */
  const getVisible = () => {
    if (window.innerWidth <= 768)  return 1;
    if (window.innerWidth <= 1024) return 2;
    return 3;
  };

  /* Crea los puntos indicadores */
  const buildDots = () => {
    if (!dotsWrap) return;
    dotsWrap.innerHTML = '';
    const count = Math.ceil(totalCards / getVisible());
    for (let i = 0; i < count; i++) {
      const dot = document.createElement('button');
      dot.className = 'testimonials__dot';
      dot.setAttribute('role', 'tab');
      dot.setAttribute('aria-label', `Ir al testimonio ${i + 1}`);
      dot.setAttribute('aria-selected', i === currentIndex ? 'true' : 'false');
      if (i === currentIndex) dot.classList.add('is-active');
      dot.addEventListener('click', () => goTo(i));
      dotsWrap.appendChild(dot);
    }
  };

  /* Navega al índice indicado */
  const goTo = (index) => {
    const visible = getVisible();
    const maxIndex = Math.ceil(totalCards / visible) - 1;
    currentIndex = Math.max(0, Math.min(index, maxIndex));

    // Calcula el offset: ancho de la tarjeta + gap
    const cardWidth = cards[0]?.offsetWidth || 0;
    const gap = 24; // coincide con --space-md = 1.5rem = 24px aprox.
    track.style.transform = `translateX(-${currentIndex * (cardWidth + gap) * visible}px)`;

    // Actualiza dots
    $$('.testimonials__dot', dotsWrap).forEach((dot, i) => {
      dot.classList.toggle('is-active', i === currentIndex);
      dot.setAttribute('aria-selected', (i === currentIndex).toString());
    });

    // Actualiza accesibilidad de las tarjetas
    cards.forEach((card, i) => {
      const isHidden = i < currentIndex * visible || i >= (currentIndex + 1) * visible;
      card.setAttribute('aria-hidden', isHidden.toString());
    });
  };

  const next = () => {
    const maxIndex = Math.ceil(totalCards / getVisible()) - 1;
    goTo(currentIndex < maxIndex ? currentIndex + 1 : 0);
  };

  const prev = () => {
    const maxIndex = Math.ceil(totalCards / getVisible()) - 1;
    goTo(currentIndex > 0 ? currentIndex - 1 : maxIndex);
  };

  /* Autoplay */
  const startAutoplay = () => {
    clearInterval(autoplayTimer);
    autoplayTimer = setInterval(next, 5000);
  };

  const stopAutoplay = () => clearInterval(autoplayTimer);

  /* Eventos */
  nextBtn.addEventListener('click', () => { next(); startAutoplay(); });
  prevBtn.addEventListener('click', () => { prev(); startAutoplay(); });

  // Pausa autoplay al enfocar/hover la sección
  $$('.testimonials__carousel').forEach(el => {
    el.addEventListener('mouseenter', stopAutoplay);
    el.addEventListener('mouseleave', startAutoplay);
    el.addEventListener('focusin',   stopAutoplay);
    el.addEventListener('focusout',  startAutoplay);
  });

  // Soporte táctil (swipe)
  let touchStartX = 0;
  track.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
  track.addEventListener('touchend',   e => {
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) diff > 0 ? next() : prev();
  });

  // Recalcula en resize
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { buildDots(); goTo(0); }, 200);
  });

  // Init
  buildDots();
  goTo(0);
  startAutoplay();
})();

/* ----------------------------------------------------------------
   6. FORMULARIO DE CONTACTO (validación + envío simulado)
   ---------------------------------------------------------------- */
(function initContactForm() {
  const form       = $('#contact-form');
  const submitBtn  = $('#submit-btn');
  const successMsg = $('#form-success');

  if (!form) return;

  /**
   * Valida un campo individual y muestra/oculta su error.
   * @param {HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement} field
   * @returns {boolean} true si es válido
   */
  const validateField = (field) => {
    const errorEl = $(`#${field.id}-error`);
    let message = '';

    if (field.required && !field.value.trim()) {
      message = 'Este campo es obligatorio.';
    } else if (field.type === 'email' && field.value) {
      const emailRE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRE.test(field.value)) {
        message = 'Introduce un email válido.';
      }
    } else if (field.type === 'tel' && field.value) {
      const telRE = /^[\d\s\+\-\(\)]{7,15}$/;
      if (!telRE.test(field.value)) {
        message = 'Introduce un teléfono válido.';
      }
    } else if (field.type === 'checkbox' && field.required && !field.checked) {
      message = 'Debes aceptar la política de privacidad.';
    }

    field.classList.toggle('is-invalid', !!message);
    if (errorEl) errorEl.textContent = message;

    return !message;
  };

  /* Validación en tiempo real al salir del campo (blur) */
  $$('[required], [type="email"], [type="tel"]', form).forEach(field => {
    field.addEventListener('blur', () => validateField(field));
    field.addEventListener('input', () => {
      if (field.classList.contains('is-invalid')) validateField(field);
    });
  });

  /* Envío del formulario */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    /* Valida todos los campos */
    const fields = $$('input, textarea, select', form);
    let isValid = true;

    fields.forEach(field => {
      if (!validateField(field)) isValid = false;
    });

    /* Valida el checkbox de privacidad explícitamente */
    const privacyCheck = $('#privacy');
    const privacyError = $('#privacy-error');
    if (privacyCheck && !privacyCheck.checked) {
      isValid = false;
      if (privacyError) privacyError.textContent = 'Debes aceptar la política de privacidad.';
    }

    if (!isValid) {
      /* Hace scroll al primer campo inválido */
      const firstInvalid = form.querySelector('.is-invalid');
      if (firstInvalid) firstInvalid.focus();
      return;
    }

    /* Recoge los datos del formulario */
    const formData = {
      nombre:   $('#name')?.value.trim(),
      email:    $('#email')?.value.trim(),
      telefono: $('#phone')?.value.trim(),
      servicio: $('#service')?.value,
      mensaje:  $('#message')?.value.trim(),
      timestamp: new Date().toISOString(),
    };

    /* --- SIMULACIÓN DE ENVÍO --- */
    /* En producción, aquí harías un fetch() a tu API / backend */
    console.log('📬 HSDental · Formulario enviado:', formData);

    /* Estado de carga en el botón */
    submitBtn.disabled = true;
    const btnText = submitBtn.querySelector('.btn__text');
    if (btnText) btnText.textContent = 'Enviando…';

    /* Simula latencia de red (800ms) */
    await new Promise(resolve => setTimeout(resolve, 800));

    /* Muestra mensaje de éxito */
    form.reset();
    fields.forEach(f => f.classList.remove('is-invalid'));
    successMsg.removeAttribute('hidden');
    successMsg.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    /* Restaura el botón */
    submitBtn.disabled = false;
    if (btnText) btnText.textContent = 'Enviar solicitud';

    /* Oculta el mensaje de éxito tras 6 segundos */
    setTimeout(() => successMsg.setAttribute('hidden', ''), 6000);
  });
})();

/* ----------------------------------------------------------------
   7. BOTÓN "VOLVER ARRIBA"
   ---------------------------------------------------------------- */
(function initBackToTop() {
  const btn = $('#back-to-top');
  if (!btn) return;

  const toggle = () => {
    const visible = window.scrollY > 400;
    btn.classList.toggle('is-visible', visible);
    btn.removeAttribute('hidden');
  };

  window.addEventListener('scroll', toggle, { passive: true });

  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();

/* ----------------------------------------------------------------
   8. AÑO DINÁMICO EN EL FOOTER
   ---------------------------------------------------------------- */
(function setFooterYear() {
  const el = $('#footer-year');
  if (el) el.textContent = new Date().getFullYear();
})();

/* ----------------------------------------------------------------
   9. SELECTOR DE CLÍNICA
   ---------------------------------------------------------------- */
(function initClinicSelector() {
  const clinicSelect = $('#clinic');
  const clinicCards = $$('.clinic-card');
  const clinicMaps = $$('.clinic-map');

  if (!clinicSelect || !clinicCards.length) return;

  // Datos de clínicas
  const clinicData = {
    mostoles: {
      name: 'Mostoles',
      address: 'Calle Principal, 123, 28935 Mostoles, Madrid',
      phone: '+34 916 449 876',
      schedule: 'Lun-Vie: 9:00-20:00 | Sab: 9:00-14:00'
    },
    alcorcon: {
      name: 'Alcorcón',
      address: 'Avenida de Europa, 56, 28922 Alcorcón, Madrid',
      phone: '+34 916 649 203',
      schedule: 'Lun-Vie: 9:00-20:00 | Sab: 10:00-13:00'
    }
  };

  // Cambiar clínica seleccionada visualmente
  const updateClinicSelection = (selectedClinic) => {
    clinicCards.forEach(card => {
      const clinic = card.getAttribute('data-clinic');
      const isSelected = clinic === selectedClinic;
      
      card.style.opacity = isSelected ? '1' : '0.6';
      card.style.transform = isSelected ? 'scale(1)' : 'scale(0.98)';
      card.style.pointerEvents = isSelected ? 'auto' : 'none';
      
      // Highlight border
      if (isSelected) {
        card.style.borderColor = 'var(--clr-accent)';
        card.style.boxShadow = '0 12px 32px rgba(86,113,235,.2)';
      } else {
        card.style.borderColor = 'var(--clr-border-blue)';
        card.style.boxShadow = 'none';
      }
    });

    // Cambiar mapa según clínica seleccionada
    clinicMaps.forEach(map => {
      const mapClinic = map.getAttribute('data-clinic');
      if (mapClinic === selectedClinic) {
        map.style.display = 'block';
        map.style.animation = 'fadeIn 0.4s ease';
      } else {
        map.style.display = 'none';
      }
    });
  };

  // Event listener para cambiar clínica
  clinicSelect.addEventListener('change', (e) => {
    const selectedClinic = e.target.value;
    updateClinicSelection(selectedClinic);
    
    // Log para verificar cambio
    console.log('Clínica seleccionada:', clinicData[selectedClinic].name);
  });

  // Inicializar con la primera clínica
  updateClinicSelection(clinicSelect.value);
})();


(function initSmoothScroll() {
  $$('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const targetId = link.getAttribute('href');
      if (targetId === '#') return;

      const target = $(targetId);
      if (!target) return;

      e.preventDefault();
      const navHeight = document.querySelector('.navbar')?.offsetHeight || 72;
      const top = target.getBoundingClientRect().top + window.scrollY - navHeight;

      window.scrollTo({ top, behavior: 'smooth' });
    });
  });
})();
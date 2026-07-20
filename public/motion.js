(() => {
    const root = document.documentElement;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    root.classList.add('motion-ready');

    const revealSelector = [
        '.home-section-heading',
        '.service-card',
        '.service-cta',
        '.portfolio-links a',
        '.feedback-panel',
        '.section-heading',
        '.banner-card',
        '.portfolio-card',
        '.command-card',
        '.discord-copy',
        '.server-widget'
    ].join(',');

    const prepareReveal = (element, index = 0) => {
        if (!(element instanceof HTMLElement) || element.dataset.revealReady === 'true') return;

        element.dataset.revealReady = 'true';
        element.setAttribute('data-reveal', '');
        element.style.setProperty('--reveal-delay', `${Math.min(index % 6, 5) * 55}ms`);

        if (reducedMotion || !revealObserver) {
            element.classList.add('is-visible');
            return;
        }

        revealObserver.observe(element);
    };

    const revealObserver = reducedMotion || !('IntersectionObserver' in window)
        ? null
        : new IntersectionObserver((entries, observer) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target);
            });
        }, {
            rootMargin: '0px 0px -7% 0px',
            threshold: 0.08
        });

    document.querySelectorAll(revealSelector).forEach(prepareReveal);

    const observeDynamicContent = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (!(node instanceof HTMLElement)) return;

                if (node.matches(revealSelector)) prepareReveal(node);
                node.querySelectorAll(revealSelector).forEach(prepareReveal);
            });
        });
    });

    observeDynamicContent.observe(document.body, {
        childList: true,
        subtree: true
    });

    if (reducedMotion) return;

    let pointerFrame = 0;
    window.addEventListener('pointermove', (event) => {
        if (pointerFrame) return;

        pointerFrame = window.requestAnimationFrame(() => {
            root.style.setProperty('--mouse-x', `${event.clientX}px`);
            root.style.setProperty('--mouse-y', `${event.clientY}px`);
            pointerFrame = 0;
        });
    }, { passive: true });

    document.querySelectorAll('.service-card').forEach((card) => {
        card.addEventListener('pointermove', (event) => {
            const bounds = card.getBoundingClientRect();
            card.style.setProperty('--card-x', `${event.clientX - bounds.left}px`);
            card.style.setProperty('--card-y', `${event.clientY - bounds.top}px`);
        }, { passive: true });
    });
})();

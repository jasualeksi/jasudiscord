(() => {
    const root = document.documentElement;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    root.classList.add('motion-ready');

    const revealSelector = [
        '.section-title',
        '.service-list article',
        '.portfolio-menu a',
        '.cta',
        '.feedback-panel',
        '.portfolio-heading',
        '.banner-card',
        '.portfolio-card',
        '.command-card',
        '.page-hero > div',
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
                entry.target.classList.toggle('is-visible', entry.isIntersecting);
            });
        }, {
            rootMargin: '-4% 0px -7% 0px',
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

    document.querySelectorAll('.floating-nav a').forEach((link) => {
        const targetPath = new URL(link.href, window.location.origin).pathname.replace(/\/$/, '');
        const currentPath = window.location.pathname.replace(/\/$/, '') || '/etusivu';
        link.classList.toggle('is-current', targetPath === currentPath);
    });
})();

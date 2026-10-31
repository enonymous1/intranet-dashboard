import { Config } from '../config/config.js';

/**
 * Layout-engine adapters. DashboardModule depends on this contract, never
 * on GridStack directly — so a GridStack API change (the exact thing
 * that silently broke v1.1.0, when init's argument order was reversed)
 * is fixed in one file, and the fallback is a real adapter rather than
 * a set of if-branches scattered through the dashboard.
 *
 * Contract:
 *   init(container) — attach to the container (may throw → fallback)
 *   add(element, geometry) — place an already-built item element, return it
 *   remove(element) — detach one item element
 *   clear() — remove all item elements
 *   beginBatch() / endBatch() — suppress per-item layout until endBatch
 *   readGeometry() — live [{ id, x, y, w, h }] from the engine, or []
 *     when the engine has no live geometry (fallback: the registry is right)
 *   onChange(handler) — called when the user drags/resizes (no-op for fallback)
 *   destroy() — tear the engine down
 *   isGridStack — true only for the real GridStack adapter
 */
export class GridStackAdapter {
    isGridStack = true;

    init(container) {
        if (typeof window === 'undefined' || !window.GridStack
            || typeof window.GridStack.init !== 'function') {
            throw new Error('GridStack is not available');
        }
        // GridStack 10: init(OPTIONS, selector) — options first. Passing
        // them the other way round throws inside GridStack; that throw
        // is what silently dropped v1.1.0 to the fallback layout.
        this.grid = window.GridStack.init(Config.getGridStackConfig(), container);
        if (!this.grid) {
            throw new Error('GridStack.init returned no grid');
        }
        this.container = container;
    }

    add(element, { x, y, w, h }) {
        return this.grid.addWidget(element, { x, y, w, h });
    }

    remove(element) {
        this.grid.removeWidget(element);
    }

    clear() {
        this.grid.removeAll();
    }

    beginBatch() {
        if (typeof this.grid.batchUpdate === 'function') {
            this.grid.batchUpdate(true);
        }
    }

    endBatch() {
        if (typeof this.grid.batchUpdate === 'function') {
            this.grid.batchUpdate(false);
        }
    }

    readGeometry() {
        const out = [];
        try {
            this.grid.save().forEach((node) => {
                const card = node.el ? node.el.querySelector('[data-widget-id]') : null;
                const widgetId = card ? card.getAttribute('data-widget-id') : null;
                if (widgetId) {
                    out.push({
                        id: widgetId,
                        x: node.x, y: node.y, w: node.w, h: node.h,
                    });
                }
            });
        } catch {
            // Engine state unreadable: registry geometry is the fallback.
        }
        return out;
    }

    onChange(handler) {
        this.grid.on('change', handler);
    }

    destroy() {
        try {
            this.grid.destroy();
        } catch {
            // Already destroyed.
        }
    }
}

export class FlexFallbackAdapter {
    isGridStack = false;

    init(container) {
        this.container = container;
        container.classList.add('fallback-grid');
    }

    add(element, { w }) {
        element.style.width = `${(w / 12) * 100}%`;
        this.container.appendChild(element);
        return element;
    }

    remove(element) {
        if (element.parentNode) {
            element.parentNode.removeChild(element);
        }
    }

    clear() {
        this.container.innerHTML = '';
    }

    beginBatch() { /* No per-item layout to suppress. */ }

    endBatch() { /* No per-item layout to suppress. */ }

    readGeometry() {
        return [];
    }

    onChange() { /* No dragging in the fallback, so nothing to report. */ }

    destroy() { /* Nothing to tear down. */ }
}

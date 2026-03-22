/**
 * shared.js — Blueprint diagram engine
 * Provides: isDark, defaultCfg, initDiagram, initAllDiagrams
 *
 * Usage in page scripts:
 *   import mermaid from 'mermaid-cdn';
 *   import { isDark, initAllDiagrams } from './shared.js';
 *   mermaid.initialize({ ... });   // page-specific config
 *   initAllDiagrams(pageCfg);
 */

import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

export const isDark = !matchMedia('(prefers-color-scheme: light)').matches;

export const defaultCfg = {
	fitPadding: 28,
	maxHeightPx: 1100,
	maxHeightVh: 0.9,
	maxInitialZoom: 1.5,
	maxZoom: 6,
	minHeight: 500,
	minZoom: 0.06,
	readabilityFloor: 0.5,
	zoomStep: 0.13
};

export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// Global drag state shared across all diagrams on a page
let activeDrag = null;
addEventListener('mousemove', (e) => activeDrag?.onMove(e));
addEventListener('mouseup', () => {
	activeDrag?.onEnd();
	activeDrag = null;
});

export function initAllDiagrams(cfg) {
	document.querySelectorAll('.diagram-shell').forEach((shell) => initDiagram(shell, cfg));
}

export function initDiagram(shell, cfg) {
	cfg = Object.assign({}, defaultCfg, cfg);

	const wrap = shell.querySelector('.mermaid-wrap');
	const viewport = shell.querySelector('.mermaid-viewport');
	const canvas = shell.querySelector('.mermaid-canvas');
	const source = shell.querySelector('.diagram-source');
	const label = shell.querySelector('.zoom-label');
	if (!wrap || !viewport || !canvas || !source || !label) return;

	let fitMode = 'contain',
		zoom = 1;
	let panX = 0,
		panY = 0,
		svgH = 0,
		svgW = 0;
	let spx = 0,
		spy = 0,
		sx = 0,
		sy = 0;
	let touchCx = 0,
		touchCy = 0,
		touchDist = 0;

	const constrainPan = () => {
		const vH = viewport.clientHeight,
			vW = viewport.clientWidth;
		const p = cfg.fitPadding,
			rH = svgH * zoom,
			rW = svgW * zoom;
		panX = rW + p * 2 <= vW ? (vW - rW) / 2 : clamp(panX, vW - rW - p, p);
		panY = rH + p * 2 <= vH ? (vH - rH) / 2 : clamp(panY, vH - rH - p, p);
	};

	const applyT = () => {
		const svg = canvas.querySelector('svg');
		if (!svg || !svgW) return;
		constrainPan();
		svg.style.width = svgW * zoom + 'px';
		svg.style.height = svgH * zoom + 'px';
		canvas.style.transform = 'translate(' + panX + 'px,' + panY + 'px)';
		label.textContent = Math.round(zoom * 100) + '% \u2014 ' + fitMode;
	};

	const canPan = () => {
		const p = cfg.fitPadding;
		return svgW * zoom + p * 2 > viewport.clientWidth || svgH * zoom + p * 2 > viewport.clientHeight;
	};

	const smartFit = () => {
		const vH = viewport.clientHeight,
			vW = viewport.clientWidth;
		const aH = Math.max(80, vH - cfg.fitPadding * 2),
			aW = Math.max(80, vW - cfg.fitPadding * 2);
		const contain = Math.min(aW / svgW, aH / svgH);
		let mode = 'contain',
			z = contain;
		if (contain < cfg.readabilityFloor) {
			z = svgH / svgW >= vH / Math.max(vW, 1) ? aW / svgW : aH / svgH;
			mode = 'priority';
		}
		return { mode, zoom: clamp(z, cfg.minZoom, cfg.maxInitialZoom) };
	};

	const fitDiagram = () => {
		if (!svgW) return;
		const f = smartFit();
		zoom = f.zoom;
		fitMode = f.mode;
		panX = (viewport.clientWidth - svgW * zoom) / 2;
		panY = (viewport.clientHeight - svgH * zoom) / 2;
		applyT();
	};

	const setOneToOne = () => {
		zoom = 1;
		fitMode = '1:1';
		panX = (viewport.clientWidth - svgW) / 2;
		panY = (viewport.clientHeight - svgH) / 2;
		applyT();
	};

	const zoomAround = (factor, cx, cy) => {
		const next = clamp(zoom * factor, cfg.minZoom, cfg.maxZoom);
		panX = cx - (next / zoom) * (cx - panX);
		panY = cy - (next / zoom) * (cy - panY);
		zoom = next;
		fitMode = 'custom';
		applyT();
	};

	const setAdaptiveH = () => {
		if (!svgW) return;
		const usable = Math.max(280, wrap.getBoundingClientRect().width - 2);
		const idealH = (svgH / svgW) * usable + cfg.fitPadding * 2;
		const maxVp = Math.floor(innerHeight * cfg.maxHeightVh);
		const hard = Math.min(cfg.maxHeightPx, Math.max(cfg.minHeight + 40, maxVp));
		wrap.style.height = Math.round(clamp(idealH, cfg.minHeight, hard)) + 'px';
	};

	const openInNewTab = () => {
		const svg = canvas.querySelector('svg');
		if (!svg) return;
		const clone = svg.cloneNode(true);
		clone.style.width = '';
		clone.style.height = '';
		const bg = isDark ? '#091525' : '#f0f8ff';
		const doc =
			'<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
			'<title>Valora Diagram<\/title>' +
			'<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:' +
			bg +
			';padding:40px;box-sizing:border-box}svg{max-width:100%;max-height:90vh;height:auto}<\/style>' +
			'<\/head><body>' +
			clone.outerHTML +
			'<\/body><\/html>';
		open(URL.createObjectURL(new Blob([doc], { type: 'text/html' })), '_blank');
	};

	const actions = {
		'zoom-expand': openInNewTab,
		'zoom-fit': fitDiagram,
		'zoom-in': () => zoomAround(1 + cfg.zoomStep, viewport.clientWidth / 2, viewport.clientHeight / 2),
		'zoom-one': setOneToOne,
		'zoom-out': () => zoomAround(1 / (1 + cfg.zoomStep), viewport.clientWidth / 2, viewport.clientHeight / 2)
	};
	Object.entries(actions).forEach(([a, fn]) =>
		wrap.querySelector('[data-action="' + a + '"]')?.addEventListener('click', fn)
	);

	viewport.addEventListener('dblclick', fitDiagram);

	viewport.addEventListener(
		'wheel',
		(e) => {
			if (e.ctrlKey || e.metaKey) {
				e.preventDefault();
				const r = viewport.getBoundingClientRect();
				zoomAround(e.deltaY < 0 ? 1 + cfg.zoomStep : 1 / (1 + cfg.zoomStep), e.clientX - r.left, e.clientY - r.top);
				return;
			}
			if (canPan()) {
				e.preventDefault();
				panX -= e.deltaX;
				panY -= e.deltaY;
				applyT();
			}
		},
		{ passive: false }
	);

	viewport.addEventListener('mousedown', (e) => {
		if (e.target.closest('.zoom-controls') || !canPan()) return;
		wrap.classList.add('is-panning');
		sx = e.clientX;
		sy = e.clientY;
		spx = panX;
		spy = panY;
		e.preventDefault();
		activeDrag = {
			onEnd: () => wrap.classList.remove('is-panning'),
			onMove: (ev) => {
				panX = spx + (ev.clientX - sx);
				panY = spy + (ev.clientY - sy);
				applyT();
			}
		};
	});

	viewport.addEventListener(
		'touchstart',
		(e) => {
			if (e.touches.length === 1) {
				sx = e.touches[0].clientX;
				sy = e.touches[0].clientY;
				spx = panX;
				spy = panY;
			} else if (e.touches.length === 2) {
				const dx = e.touches[0].clientX - e.touches[1].clientX;
				const dy = e.touches[0].clientY - e.touches[1].clientY;
				touchDist = Math.sqrt(dx * dx + dy * dy);
				const r = viewport.getBoundingClientRect();
				touchCx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left;
				touchCy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top;
			}
		},
		{ passive: true }
	);

	viewport.addEventListener(
		'touchmove',
		(e) => {
			if (e.touches.length === 1 && canPan()) {
				if (touchDist > 0) {
					sx = e.touches[0].clientX;
					sy = e.touches[0].clientY;
					spx = panX;
					spy = panY;
					touchDist = 0;
				}
				e.preventDefault();
				panX = spx + (e.touches[0].clientX - sx);
				panY = spy + (e.touches[0].clientY - sy);
				applyT();
			} else if (e.touches.length === 2 && touchDist > 0) {
				e.preventDefault();
				const dx = e.touches[0].clientX - e.touches[1].clientX;
				const dy = e.touches[0].clientY - e.touches[1].clientY;
				const d = Math.sqrt(dx * dx + dy * dy);
				zoomAround(d / touchDist, touchCx, touchCy);
				touchDist = d;
			}
		},
		{ passive: false }
	);

	new ResizeObserver(() => {
		if (svgW) {
			setAdaptiveH();
			fitDiagram();
		}
	}).observe(wrap);

	(async () => {
		try {
			const code = source.textContent.trim();
			if (!code) {
				label.textContent = 'Error: empty source';
				return;
			}
			const id = 'diag-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
			const { svg } = await mermaid.render(id, code);
			const parser = new DOMParser();
			const svgDoc = parser.parseFromString(svg, 'image/svg+xml');
			canvas.textContent = '';
			if (svgDoc.querySelector('parsererror')) {
				canvas.insertAdjacentHTML('beforeend', svg);
			} else {
				canvas.appendChild(svgDoc.documentElement);
			}
			const svgNode = canvas.querySelector('svg');
			if (!svgNode) {
				label.textContent = 'Error: no SVG';
				return;
			}
			const { h, w } = readSize(svgNode);
			svgW = w;
			svgH = h;
			svgNode.removeAttribute('width');
			svgNode.removeAttribute('height');
			svgNode.style.maxWidth = 'none';
			svgNode.style.display = 'block';
			setAdaptiveH();
			fitDiagram();
		} catch (err) {
			console.error('Mermaid render error:', err);
			label.textContent = 'Error: ' + (err.message || 'render failed');
		}
	})();
}

function readSize(svg) {
	let h = 0,
		w = 0;
	if (svg.viewBox?.baseVal?.width > 0) {
		w = svg.viewBox.baseVal.width;
		h = svg.viewBox.baseVal.height;
	}
	if (!w) {
		w = parseFloat(svg.getAttribute('width')) || 0;
		h = parseFloat(svg.getAttribute('height')) || 0;
	}
	if (!w) {
		const b = svg.getBBox();
		w = b.width;
		h = b.height;
	}
	if (!w) {
		const r = svg.getBoundingClientRect();
		w = r.width || 800;
		h = r.height || 600;
	}
	if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
	return { h, w };
}

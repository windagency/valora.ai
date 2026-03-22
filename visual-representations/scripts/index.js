/* ── Index — iframe navigation ── */

const frameArea = document.getElementById('frame-area');
const placeholder = document.getElementById('placeholder');
const breadcrumb = document.getElementById('breadcrumb-label');
const navItems = document.querySelectorAll('.nav-item[data-src]');

let activeFrame = null;
const frameCache = {};

function loadDiagram(src, title) {
	placeholder.style.display = 'none';

	if (activeFrame) activeFrame.classList.remove('visible');

	if (frameCache[src]) {
		activeFrame = frameCache[src];
		activeFrame.classList.add('visible');
	} else {
		const frame = document.createElement('iframe');
		frame.src = src;
		frame.addEventListener('load', function () {
			frame.classList.add('visible');
		});
		frameArea.appendChild(frame);
		frameCache[src] = frame;
		activeFrame = frame;
	}

	breadcrumb.textContent = title;
}

navItems.forEach(function (item) {
	item.addEventListener('click', function (e) {
		e.preventDefault();
		navItems.forEach(function (n) {
			n.classList.remove('active');
		});
		item.classList.add('active');
		loadDiagram(item.getAttribute('data-src'), item.querySelector('.nav-item-title').textContent);
	});
});

navItems[0].click();

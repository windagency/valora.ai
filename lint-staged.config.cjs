module.exports = {
	'*': ['secretlint'],
	'*.{json,md,yml,yaml}': ['prettier --write'],
	'*.{ts,tsx,js,jsx}': ['eslint --fix', 'prettier --write', () => 'tsc --noEmit']
};

const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
const publicDir = path.join(__dirname, 'public');
const testDir = path.join(__dirname, 'tests');
const threeDir = path.join(__dirname, 'node_modules', 'three');

app.use(express.static(publicDir));

app.use('/test', express.static(path.join(testDir, 'test3.html')));

app.use('/three', express.static(threeDir));

app.get('/health', (req, res) => {
	res.json({ ok: true });
});

app.get('frigate.glb', (req, res) => {
	res.sendFile(path.join(publicDir, 'frigate.glb'));
});

app.get('/cargo_spaceship.glb', (req, res) => {
	res.sendFile(path.join(publicDir, 'cargo_spaceship.glb'));
});

app.get('/', (req, res) => {
	res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(port, () => {
	console.log(`Server running at http://localhost:${port}`);
});

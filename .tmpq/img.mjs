const FILE = '2026-08/d93141ea-a0f5-44f8-86d4-a1353c4368e7.png';
const base = 'http://localhost:3100/api/runtime/tech-report';
const got = await (await fetch(`${base}?far_no=FAR-25-1058`)).json();
const doc = got.data;
doc.visual_top = FILE;
doc.samples[0].images = { ...doc.samples[0].images, stack: FILE, dist1: FILE, meta1: FILE };
const res = await fetch(base, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(doc) });
console.log('PUT', res.status, await res.text());

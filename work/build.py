from pathlib import Path
root=Path(__file__).resolve().parent.parent
parts=['map-data.js','terrain-data.js','material-photos.js','renderer.js','scan-data.js','landmarks.js','geometry.js','controls.js','map-ui.js','survey/views.js','app.js']
code='\n\n'.join((root/'work'/x).read_text() for x in parts)
assert '</script' not in code.lower()
html=(root/'work/template.html').read_text().replace('/* BUNDLE */',code)
(root/'docs/index.html').write_text(html)
print(f'Built index.html: {len(html.encode()):,} bytes; no dependencies')

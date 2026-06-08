export interface StaticWebAppFile {
  content: string;
  path: string;
}

export interface StaticWebAppTemplateOptions {
  theme?: string;
}

const titleFromTheme = (theme?: string): string => {
  const text = theme?.trim() || 'Modern Web App';
  if (/portfolio/iu.test(text)) return 'Studio Portfolio';
  if (/task/iu.test(text)) return 'Focus Board';
  if (/landing/iu.test(text)) return 'Launch Studio';
  return 'Nova Studio';
};

export const createStaticWebAppFiles = (
  options: StaticWebAppTemplateOptions = {},
): StaticWebAppFile[] => {
  const title = titleFromTheme(options.theme);
  const description = options.theme?.trim() || 'a simple modern web app';
  return [
    {
      path: 'index.html',
      content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <link rel="stylesheet" href="styles.css">
  </head>
  <body>
    <main class="shell">
      <section class="hero" aria-labelledby="hero-title">
        <p class="eyebrow">Plain HTML CSS JS</p>
        <h1 id="hero-title">${title}</h1>
        <p class="lede">A polished starter for ${description}, built without dependencies.</p>
        <button class="cta" type="button">Explore the demo</button>
      </section>
      <section class="features" aria-label="Highlights">
        <article>
          <span>01</span>
          <h2>Fast</h2>
          <p>Static files load instantly and are easy to host anywhere.</p>
        </article>
        <article>
          <span>02</span>
          <h2>Responsive</h2>
          <p>The layout adapts cleanly from phones to desktops.</p>
        </article>
        <article>
          <span>03</span>
          <h2>Focused</h2>
          <p>Small, readable code gives you a reliable place to start.</p>
        </article>
      </section>
    </main>
    <script src="app.js"></script>
  </body>
</html>
`,
    },
    {
      path: 'styles.css',
      content: `:root {
  color-scheme: dark;
  --bg: #101218;
  --panel: #181c24;
  --text: #f4f7fb;
  --muted: #aab4c3;
  --accent: #56d6b4;
  --accent-2: #f5c767;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: radial-gradient(circle at top left, #263144 0, transparent 32rem), var(--bg);
  color: var(--text);
}

.shell {
  width: min(1120px, calc(100% - 32px));
  margin: 0 auto;
  padding: 72px 0;
}

.hero {
  display: grid;
  gap: 24px;
  max-width: 760px;
  min-height: 48vh;
  align-content: center;
}

.eyebrow {
  margin: 0;
  color: var(--accent);
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  font-size: clamp(3rem, 8vw, 6.5rem);
  line-height: 0.95;
}

.lede {
  margin: 0;
  max-width: 620px;
  color: var(--muted);
  font-size: 1.2rem;
  line-height: 1.7;
}

.cta {
  width: fit-content;
  border: 0;
  border-radius: 8px;
  padding: 14px 20px;
  background: var(--accent);
  color: #07120f;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}

.features {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-top: 32px;
}

article {
  min-height: 180px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 24px;
  background: color-mix(in srgb, var(--panel) 88%, transparent);
}

article span {
  color: var(--accent-2);
  font-weight: 800;
}

article h2 {
  margin: 20px 0 10px;
}

article p {
  margin: 0;
  color: var(--muted);
  line-height: 1.6;
}

@media (max-width: 760px) {
  .shell {
    padding: 48px 0;
  }

  .features {
    grid-template-columns: 1fr;
  }
}
`,
    },
    {
      path: 'app.js',
      content: `const button = document.querySelector('.cta');

button?.addEventListener('click', () => {
  document.body.classList.toggle('spark');
  button.textContent = document.body.classList.contains('spark')
    ? 'Nice, it is alive'
    : 'Explore the demo';
});
`,
    },
  ];
};

export const formatStaticWebAppPlan = (files: StaticWebAppFile[]): string =>
  [
    'Create a static web app with:',
    ...files.map((file) => `- ${file.path}`),
  ].join('\n');

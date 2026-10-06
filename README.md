
## GitHub Pages preview

The GitHub Pages deployment serves the static HTML, CSS, and JavaScript as a frontend preview. GitHub Pages cannot run this project's Python API or connect to MongoDB, so sign-in, bookings, event changes, reviews, and organizer features require running the full app locally or deploying its API and database separately.

The `.github/workflows/pages.yml` workflow deploys the static preview after changes to website files are pushed to `main`. In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**. After the first successful deployment, the site URL appears in the workflow run's deployment environment.

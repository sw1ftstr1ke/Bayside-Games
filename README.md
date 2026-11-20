# Bayside Games

The public website is published with GitHub Pages:

- Home: https://sw1ftstr1ke.github.io/Bayside-Games/
- Apex GP: https://sw1ftstr1ke.github.io/Bayside-Games/apex-gp/

## Deployment

The GitHub Actions workflow in `.github/workflows/static.yml` rebuilds Apex GP and publishes the static site whenever `main` changes.

The hidden, numbered `.b64` directories are **active build inputs**, not disposable clutter. They contain the compressed game archive and ordered patches used by the workflow. Keep them in place unless the workflow is updated at the same time.

Superseded patch backups and generated ZIP files are not stored in the repository. The workflow recreates `Apex-GP.zip` during its build.

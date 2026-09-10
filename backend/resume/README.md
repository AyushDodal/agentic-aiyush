# Resume Download Asset

`resume.pdf` is the recruiter-facing copy supplied for this project. It is bundled
with the API so `/api/resume` works across fresh Vercel instances. It contains the
resume's contact details and is intended to be publicly downloadable. Committing
this asset to a public Git repository also makes the file public there.

Replace the asset and ingest that same version using the operator CLI whenever
the resume changes. Keep private drafts and generated vector data in `../data/`.

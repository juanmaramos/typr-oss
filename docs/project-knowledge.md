# Project Knowledge

Typr Projects use a compiled knowledge pipeline for briefs and project-scoped Ask.

## Pipeline

1. Included notes and indexed files become project source materials.
2. Long sources are split into chunks with source metadata.
3. Each source is compiled into a compact factual digest.
4. Project-level knowledge is synthesized from the current source digests.
5. The project brief is rebuilt from current compiled digests and cites source keys.
6. Project Ask uses the brief for orientation, then grounds project-specific claims in the compiled source digests and selected raw chunks.

This adapts Andrej Karpathy's [LLM wiki idea](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) for knowledge work: maintain durable intermediate knowledge artifacts instead of re-reading raw chunks from scratch for every question.

## Guardrails

- Source text is treated as untrusted material, not as instructions.
- Project-specific claims must be supported by project sources.
- Brief generation rebuilds from the current source set to avoid stale brief prose contaminating future summaries.
- Ask cites source keys such as `S1` and uses selected raw chunks only to verify relevant details.
- Health checks flag missing or stale digests, failed file extraction, and citation issues.

## Related Code

- `apps/desktop/src/lib/project-knowledge.ts`
- `apps/desktop/src/lib/project-briefs.ts`
- `apps/desktop/src/lib/ask.ts`

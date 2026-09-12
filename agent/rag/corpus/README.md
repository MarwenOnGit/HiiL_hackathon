# Legal corpus

**This directory is intentionally empty.** No legal text has been written by
the tooling, and none should be: inventing an article to make a demo look
complete is the exact failure invariant 7 exists to prevent, and it is the one
a legal judge will catch.

Until real text is dropped in here, every legal finding renders as
"no legal basis retrieved" — which is a correct result, not a broken one.

## Layout

```
corpus/
  fr/normative/*.txt         statute — chunked one chunk per article
  fr/clause_library/*.md     model clauses — chunked per "## label" block
  fr/evaluative/*.txt        doctrine, outcomes, quantum
  ar/…                       same four, Arabic
```

`corpus_type` comes from the directory, `language` from its parent. Both are
mandatory retrieval filters, so a file in the wrong folder will simply never be
returned for the query you expect.

## Format — normative

Plain UTF-8 text. Chunk boundaries are article headings, matched as
`Article 564`, `Art. 1458`, `Article 1458 bis`, or `الفصل 564`. Anything before
the first heading is kept as a preamble chunk rather than dropped.

```
Code des obligations et des contrats — Livre II

Article 564
Le vendeur est tenu de délivrer la chose...

Article 565
La délivrance doit être faite...
```

## Format — clause library

Markdown, one model clause per `##` heading. The heading becomes the citation
label.

```
## Délai de livraison chiffré
Le fournisseur livre dans un délai de cinq (5) jours ouvrables...

## Contrôle à réception
L'acheteur dispose de sept (7) jours à compter de la réception...
```

## Loading it

```bash
cd agent && python3 -m scripts.build_index
```

Prints what it indexed per language and corpus type. Run it again after adding
files; the index is built in-process at service start, so restarting the agent
service is enough.

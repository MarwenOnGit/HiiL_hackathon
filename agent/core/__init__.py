"""Shared foundation for both agents: schemas, taxonomy, version lineage,
persistence, and the single LLM seam. Imports no provider SDK and no agent
module, so it stays the layer everything else depends on rather than the other
way round.
"""

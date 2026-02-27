"""Lightweight in-memory checkpointer compatible with langgraph 0.1.5.

This bridges the gap between langgraph==0.1.5 (old Pregel API) and
langgraph-checkpoint==1.0.12 (new MemorySaver API).

Once langgraph is upgraded to >=0.2.0, swap this for the built-in
MemorySaver or PostgresSaver.
"""
from __future__ import annotations

import copy
from collections import defaultdict
from typing import Any, Iterator, Optional

from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.base import BaseCheckpointSaver, Checkpoint, CheckpointMetadata, CheckpointTuple


class SimpleMemorySaver(BaseCheckpointSaver):
    """Thread-safe in-memory checkpoint store for langgraph 0.1.5."""

    def __init__(self) -> None:
        super().__init__()
        self.storage: dict[str, list[CheckpointTuple]] = defaultdict(list)

    def get_tuple(self, config: RunnableConfig) -> Optional[CheckpointTuple]:
        thread_id = config["configurable"]["thread_id"]
        checkpoints = self.storage.get(thread_id, [])
        if not checkpoints:
            return None
        return checkpoints[-1]

    def list(
        self,
        config: Optional[RunnableConfig],
        *,
        filter: Optional[dict[str, Any]] = None,
        before: Optional[RunnableConfig] = None,
        limit: Optional[int] = None,
    ) -> Iterator[CheckpointTuple]:
        if config is None:
            return
        thread_id = config["configurable"]["thread_id"]
        yield from self.storage.get(thread_id, [])

    def put(
        self,
        config: RunnableConfig,
        checkpoint: Checkpoint,
        metadata: CheckpointMetadata,
        new_versions: Optional[dict] = None,
    ) -> RunnableConfig:
        thread_id = config["configurable"]["thread_id"]
        c = copy.deepcopy(checkpoint)
        # Ensure versions_seen has __start__ (required by pregel)
        if "versions_seen" in c and "__start__" not in c["versions_seen"]:
            c["versions_seen"]["__start__"] = {}
        tup = CheckpointTuple(
            config=config,
            checkpoint=c,
            metadata=metadata or {},
        )
        self.storage[thread_id].append(tup)
        return config

    def setup(self) -> None:
        """No-op for in-memory store."""
        pass

"""Quick smoke test – verify all graph modules import and the graph runs end-to-end."""
from langchain_core.messages import HumanMessage

from app.core.engine.state import AgentState
print("✅ state.py OK")

from app.core.engine.router import route_query, route_intent
print("✅ router.py OK")

tests = [
    ("How do I reset my password?", "retrieval"),
    ("I need to talk to a human", "human_escalation"),
    ("Hello!", "direct_response"),
    ("Why is my webhook failing?", "retrieval"),
    ("Get me a manager right now", "human_escalation"),
    ("Thanks for the help!", "direct_response"),
]
for query, expected in tests:
    result = route_intent(query)
    status = "✓" if result == expected else f"✗ (expected {expected})"
    print(f"   {status}  route_intent({query!r}) = {result}")

from app.core.engine.retriever import retrieve_context
print("✅ retriever.py OK")

from app.core.engine.responder import generate_response, generate_direct_response
print("✅ responder.py OK")

from app.core.graph.agent_graph import build_graph, compile_graph, support_graph, SimpleMemorySaver
print("✅ agent_graph.py OK")

from app.schemas.ticket import QueryRequest, QueryResponse
print("✅ schemas OK")

# ── Test 1: Retrieval route ─────────────────────────────
print("\n⏳ Test 1: Retrieval route – 'How do I reset my password?'")
state = {
    "messages": [HumanMessage(content="How do I reset my password?")],
    "query": "How do I reset my password?",
    "route": None,
    "retrieved_docs": [],
    "is_escalated": False,
    "response": None,
    "ticket_id": None,
    "escalation_reason": None,
}
result = support_graph.invoke(state, {"configurable": {"thread_id": "verify-1"}})
assert result["route"] == "retrieval", f"Expected retrieval, got {result['route']}"
assert result["is_escalated"] is False
assert len(result["retrieved_docs"]) > 0
assert result["response"]
print(f"   ✓ route={result['route']}, docs={len(result['retrieved_docs'])}")
print(f"   ✓ response: {result['response'][:100]}…")

# ── Test 2: Direct response route ───────────────────────
print("\n⏳ Test 2: Direct response – 'Hello!'")
state2 = {
    "messages": [HumanMessage(content="Hello!")],
    "query": "Hello!",
    "route": None,
    "retrieved_docs": [],
    "is_escalated": False,
    "response": None,
    "ticket_id": None,
    "escalation_reason": None,
}
result2 = support_graph.invoke(state2, {"configurable": {"thread_id": "verify-2"}})
assert result2["route"] == "direct_response", f"Expected direct_response, got {result2['route']}"
assert result2["is_escalated"] is False
assert result2["response"]
print(f"   ✓ route={result2['route']}")
print(f"   ✓ response: {result2['response'][:100]}")

# ── Test 3: Human escalation with HITL ──────────────────
print("\n⏳ Test 3: Human escalation with HITL – 'I need to speak to a manager'")
saver = SimpleMemorySaver()
hitl_graph = compile_graph(checkpointer=saver)
state3 = {
    "messages": [HumanMessage(content="I need to speak to a manager right now!")],
    "query": "I need to speak to a manager right now!",
    "route": None,
    "retrieved_docs": [],
    "is_escalated": False,
    "response": None,
    "ticket_id": None,
    "escalation_reason": None,
}
cfg3 = {"configurable": {"thread_id": "verify-3"}}
paused = hitl_graph.invoke(state3, cfg3)
assert paused["route"] == "human_escalation"
assert paused["response"] is None, "Graph should pause before escalation node"
print("   ✓ Graph paused before escalate_to_human (HITL working)")

# Resume
resumed = hitl_graph.invoke(None, cfg3)
assert resumed["is_escalated"] is True
assert resumed["ticket_id"]
assert "escalated" in resumed["response"].lower()
print(f"   ✓ Resumed: ticket_id={resumed['ticket_id'][:12]}…")
print(f"   ✓ response: {resumed['response'][:100]}…")

print("\n🎉 All checks passed – LangGraph state machine fully operational!")

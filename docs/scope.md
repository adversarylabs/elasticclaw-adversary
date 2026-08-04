# factory/elasticclaw — mission and scope

Source of truth for what this adversary is *for*.

- **Package:** `elasticclaw`
- **Factory routing:** human PR comments are attributed to this adversary only when they match **In scope**.
- **Languages / surfaces:** ElasticClaw

## Mission

Review ElasticClaw workspaces, workflows, goals, agents, and execution policies.

## In scope (fair miss if humans raised it and we did not)

- ElasticClaw config correctness and maintainability
- Agent/workflow policy defects

## Out of scope (not a miss for this adversary)

- Unrelated app languages
- Generic CI

## Factory grading rule

- **In scope + human raised it + this adversary did not surface it** → real miss → suggested issue for **this** package
- **Out of scope** → do not grade as a miss for this adversary
- **Better fit for another adversary** → route there; do not double-count as a miss here
- **Unclear** → prefer out-of-scope for grading

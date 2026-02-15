@AGENTS.md

## Workflow Profile

```yaml
workflow:
  base_branch: main
  direct_to_main: false              # Contributor — work on feature branches
  investigation: light               # Quick search, no Explore agent
  plan_approval: auto                # Auto-approve plans
  user_testing: skip                 # No manual testing needed
  quality_gates:
    - npm test
  review:
    triage: true                     # Use NONE/LIGHT triage
    max_level: LIGHT                 # No custom review agents in this repo
    agents:
      - code-reviewer
  ship:
    method: pr                       # Contributor PR to upstream
    target: main
    linear_status: "In Progress"     # Maintainer merge completes work
    deploy_hint: "Maintainer reviews and merges PR"
  labels:
    auto_detect: false
```
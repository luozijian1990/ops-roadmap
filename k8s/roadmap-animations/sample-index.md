# Roadmap Animation Sample Index

## Samples

| Animation | Model | Reusable primitives | Domain-specific state |
|---|---|---|---|
| `deployment-rolling-update` | ReplicaSet handoff / rollout window | tabs, candidate/pod matrix, panels, overlay | old/new ReplicaSet replicas, maxSurge/maxUnavailable, pause/rollback state |
| `raft` | Consensus timeline | tabs, step playback, SVG message flight, overlay | term, role, log entries, commit state |
| `pod-create` | Control-plane handoff | tabs, status panel, SVG message flight, overlay | Pod creation phase, nodeName, Pod IP, readiness |
| `pod-lifecycle` | Four-layer state machine | tabs, panels, resettable branches, overlay | Pod Phase, Conditions, Container State, kubectl STATUS |
| `controller-reconcile` | Queue-driven reconcile loop | tabs, queue/status panels, fixed actor graph | key, desired/current diff, retry/backoff state |
| `pod-network-path` | Topology/path traversal | tabs, path highlighting, packet header panel | netns, veth, route mode, encapsulation metadata |
| `scheduler-filter-score` | Decision pipeline | tabs, candidate matrix, weighted score panel | requests formula, filter reasons, score weights, bind result |

## Runtime Boundary

The shared runtime should stay responsible for:

- Manifest-driven section and `h4` target validation.
- Top and `after-heading` mount positions.
- Independent mount/unmount per animation id.
- Tabs, play/pause, next step, reset, speed, overlay, and Esc ordering.
- Mobile behavior where only the SVG stage scrolls horizontally.

The shared runtime should not abstract:

- Raft term/log semantics.
- Pod phase or container lifecycle semantics.
- Network packet headers and route mode semantics.
- Scheduler plugin scores and filter reasons.
- Controller retry and cache convergence rules.
- Deployment rollout strategy, revision history, and ReplicaSet scale math.

## Skill Test Prompts

1. Add a state-machine animation under an existing `####` subheading, then verify manifest target validation, injection idempotence, and tab/step/reset/overlay controls.
2. Add a second animation to a section that already has a top animation, then verify both mount independently, do not duplicate after reopening the drawer, and do not share timers or overlay state.
3. Add a network-path animation from external technical notes, then verify forbidden scope terms are absent, package/header panels update per step, and mobile overflow is limited to the stage.

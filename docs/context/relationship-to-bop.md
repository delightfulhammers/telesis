## Prior Art

[Bop](https://github.com/delightfulhammers/bop) is a standalone multi-perspective code review tool by the same team. It informed the design of Telesis's native review agent — particularly the panel-of-personas model and the lesson that LLM-based semantic dedup outperforms string-based fingerprinting.

Telesis now has its own review agent (`telesis review`) with persona-based review, cross-round theme suppression, and project-aware context. Bop remains available as an external tool but is not a dependency.

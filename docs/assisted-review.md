# Assisted review

In the hosted review workspace, select a comment with a deterministic
finding. Choose the finding under **Explain a finding**, then request
Gemini guidance. The request sends that comment, the selected rule, and
its evidence. The **Include stored code context** checkbox is off by
default. Select it before the request if the short code excerpt is needed.

The response explains why the finding may matter, describes the comment's
relationship to the available context, and suggests keeping, rewriting,
removing, or investigating the comment. A suggested rewrite can be copied
or inserted into a private review note. Inserting it does not save the
note or change the repository. The reviewer makes and saves any decision.

The server verifies ownership of the scan and comment, checks that the
chosen rule belongs to that comment, and refuses assisted review for
sensitive paths such as environment files, credential directories, and
private keys. Requests use the configured Gemini model with provider-side
storage disabled. Assistance responses are shown in the current browser
session and are not used by the scanner, CI policy, or deterministic score.

Gemini may misunderstand a finding or suggest an unsuitable change.
Review the cited rule evidence and source context before acting. The
existing style assessment remains a separate optional action.
